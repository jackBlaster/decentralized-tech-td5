import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { NodeState, Value } from "../types";
import { delay } from "../utils";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  // Initialisation
  let nodeState : NodeState = { 
    killed: isFaulty,                   // if is't was stopped by the /stop route
    x: isFaulty ? null : initialValue,  // the current consensus value
    decided: isFaulty ? null : false,   // used to know if the node reached finality
    k: isFaulty ? null : 0              // current step of the node
  }
  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();
  
  node.get("/status", (req, res) => {
    if(isFaulty === true) {
      res.status(500).send('faulty');
    } else {
      res.status(200).send('live');
    }
  });



  node.post("/message", (req, res) => {
    if(nodeState.killed) { return };
    let {k, x, proposal: mode} = req.body;

    // if it's a proposal
    if(mode === true) {
      // check if actual step exist in proposal and add actual consencus to it
      if (!proposals.has(k)) { proposals.set(k, []);  }
      proposals.get(k)!.push(x);
      
      if (proposals.get(k)!?.length >= (N - F)) {
        // For each value (0 or 1), count number of occurence
        const values = proposals.get(k)!;
        const nbrNode0: number = values.filter(value => value === 0).length;
        const nbrNode1: number = values.filter(value => value === 1).length;

        // Current consencus value (x) is the value with the most occurence
        if (nbrNode0 > nbrNode1)      { x = 0; }
        else if (nbrNode0 < nbrNode1) { x = 1; }
        else { x = "?"; } 
        
        console.log(`Node ${nodeId} decided value ${x} for k = ${k}`)
        sendmessage(!mode, x, k, N);
      }
    }

    // if it's vote
    else {
      if (!votes.has(k)) { votes.set(k, []);  }
      votes.get(k)!.push(x);

      if (votes.get(k)!?.length >= (N - F)) {
        // For each value (0 or 1), count number of occurence
        const values = votes.get(k)!;
        const nbrNode0: number = values.filter(value => value === 0).length;
        const nbrNode1: number = values.filter(value => value === 1).length;

        // Decide the value to vote
        nodeState.decided = true;
        if (nbrNode0 > F) { nodeState.x = 0; } 
        else if (nbrNode1 > F) { nodeState.x = 1; }
        else{
          if (nbrNode0 + nbrNode1 > 0 && nbrNode0 > nbrNode1)  { nodeState.x = 0; }
          if (nbrNode0 + nbrNode1 > 0 && nbrNode1 > nbrNode0)  { nodeState.x = 1; }
          else { nodeState.x = Math.random() > 0.5 ? 0 : 1; } // random choice between 0 and 1
          nodeState.decided = false;
        }
        delay(200)

        // Check if all the node before have decided
        let allDecided = true;
        for (let i = 0; i < N - 1; i++) {
          fetch(`http://localhost:${BASE_NODE_PORT + i}/getState`)
            .then(response => response.json())
            .then(data => {
              // @ts-ignore
              if (!data.decided) { allDecided = false; }
            }
          );
        }

        // If all have decided, stop all nodes
        if (allDecided) {
          for (let j = 0; j < N; j++) {
            fetch(`http://localhost:${BASE_NODE_PORT + j}/stop`);
          }
        }
        
        console.log(`Node ${nodeId} vote value ${x} for k = ${k}`);
        nodeState.k = k + 1;
        sendmessage(!mode, nodeState.x, nodeState.k, N);
      }
    }
  });



  node.get("/start", async (req, res) => {
    while (!nodesAreReady()) { await delay(5); }
    
    if (!nodeState.killed) {
      nodeState.k = 1;
      const proposal : boolean = true
      sendmessage(proposal, nodeState.x, nodeState.k, N);
    }
    res.status(200).send("started");;
  });

  node.get("/stop", async (req, res) => {
    nodeState.killed = true;
    res.status(200).send("killed");
  });

  node.get("/getState", (req, res) => {
    res.status(200).send(nodeState);
  });

  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );
    setNodeIsReady(nodeId);
  });

  return server;
}

// ~~~~~~~~~~~~~~~
// ~~ FUNCTIONS ~~
// ~~~~~~~~~~~~~~~

async function sendmessage(mode: boolean, x: Value | null, k: number | null, N: number){
  for (let i = 0; i < N; i++) {
    fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            x: x,
            k: k,
            mode: mode
        })
    });
  }
}