import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value,NodeState } from "../types";
import { startConsensus, stopConsensus } from "./consensus";



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

  // TODO implement this
  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {
    if(isFaulty) {
      res.status(500).send("faulty")
    }
    else{
      res.status(200).send("live")
    }
  });

  // TODO implement this
  // this route allows the node to receive messages from other nodes
  node.post("/message", (req, res) => {
    
    res.status(200).send("Message received");
  });

  // TODO implement this
  // this route is used to start the consensus algorithm
  node.get("/start", async (req, res) => {
    let ready = nodesAreReady() && !isFaulty;

    while (!ready) {
      for (let i = 0; i < N; i++) {
        setNodeIsReady(i);
      }
      ready = nodesAreReady() && !isFaulty;
    }
    for (let i =0; i<N;i++){
      const nodeUrl = `http://localhost:${BASE_NODE_PORT + i}/message`;
      const message = "Hello, nodes! Consensus is starting.";

      try {
        await fetch(nodeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        });

        console.log(`Message sent to Node ${i}: ${message}`);
      } catch (error:any) {
        console.error(`Failed to send message to Node ${i}: ${error.message}`);
      }
    }
  
    res.status(200).send("Consensus algorithm started.");

  });

  // TODO implement this
  // this route is used to stop the consensus algorithm
  node.get("/stop", async (req, res) => {
    
    res.status(200).send("Stopped")
  });

  // TODO implement this
  // get the current state of a node
  node.get("/getState", (req, res) => {
    let state : NodeState;
    if(isFaulty) {
      state = {
        killed: false,
        x:initialValue,
        decided:null,
        k:null
      }
    }
    else {
        state = {
          killed:false,
          x:initialValue,
          decided:false,
          k:0
        }
    }
    res.status(200).send(state)
  });

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}


