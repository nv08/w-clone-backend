import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import BodyParser from "body-parser";
import { v4 as uuid } from "uuid";
import { db } from "./connection.js";
import { validateId } from "./middlewares/validateId.js";

const app = express();
app.use(BodyParser.json());
var http = createServer(app);
const io = new Server(http, {
  cors: {
    origin: "*",
  },
});

io.use((socket, next) => {
  const userId = socket.handshake.auth.userId;
  if (!userId) {
    return next(new Error("invalid"));
  }
  socket.userId = userId;
  next();
});

app.get("/", function (req, res) {
  res.send("hi");
});

app.post("/register", async (req, res) => {
  const { username, phone, password } = req.body;
  if (!username || !phone || !password) {
    res.status(400).send({ status: "failed", msg: "invalid fields" });
    return;
  }
  try {
    const findUser = await db
      .db()
      .collection("users")
      .findOne({ phone: phone });

    if (findUser && findUser.userId) {
      res.send({ status: "failed", msg: "user already exist" });
      return;
    }
    const response = await db
      .db()
      .collection("users")
      .insertOne({ userId: uuid(), username, phone, password });

    if (response.acknowledged) {
      res.send({ status: "success", data: [] });
      return;
    }
  } catch (err) {
    console.log(err);
    res.status(500).send({ status: "failed", msg: "server error" });
  }
});

app.post("/login", async (req, res) => {
  const { phone, password } = req.body;
  // add length of phone num for prod
  if (!phone || !password) {
    res.status(400).send({ status: "failed", msg: "invalid credentials" });
    return;
  }
  try {
    const user = await db.db().collection("users").findOne({ phone, password });
    if (user && user.userId) {
      res.send({ status: "success", data: user });
    } else {
      res.send({
        status: "failed",
        msg: "invalid credentials",
      });
    }
  } catch (err) {
    res.status(500).send({ status: "failed", msg: "server error" });
  }
});

app.post("/sendMessage", validateId, async(req, res) => {
  try{
  const { senderId, receiverId, message } = req.body;
    console.log('came after ');
  //update sender messages data
  const response = await db.db().collection('chat').updateOne({userId: senderId},{$push: {"conversation[receiverId]":{from: senderId,to: receiverId, message:message, time: Date.now(), status: 'SENT'}}})
  console.log(response);

  }
  catch(err){
    console.log(err);
    res.status(500).send({status: 'failed', msg: 'internal server error'})
  }
});

http.listen(process.env.PORT || 80, () => {
  console.log("server started");
});

io.on("connection", function (socket) {
  socket.onAny((event, ...args) => {
    console.log(event, args);
  });

  console.log(io.sockets);
  socket.emit("user-id", { id: socket.id });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });

  // this is the handler when user A sends msg to user B
  socket.on("msg-send", function (msg, id, callback) {
    console.log("Received a chat message", msg, id);
    // {
    //   if (err) {
    //     console.log("error");
    //     return;
    //   }
    // console.log(ack);
    // if (ack.ok) {
    //   db.db()
    //     .collection("chat")
    //     .insertOne({ ...msg, status: "delivered" });
    // } else {
    //   db.db()
    //     .collection("chat")
    //     .insertOne({ ...msg, status: "sent" });
    // }
    // });
    //callback({ ok: true });
    //if(userB is online)
    // socket.broadcast.to("User B").emit("msg-receive", { msg }, (ack) => {
    //   if (err) {
    //     console.log(err);
    //     return;
    //   }
    //   if (ack.ok) {
    //     db.db()
    //       .collection("chat")
    //       .insertOne({ ...msg, status: "delivered" });
    //     callback({ ok: true });
    //   } else {
    //     db.db()
    //       .collection("chat")
    //       .insertOne({ ...msg, status: "sent" });
    //     callback({ ok: true });
    //   }
    // });

    //if userB is offline
    // create a new msg record in User A & User B with SENT status
    //callback({ ok: true });
    // if some error
    // create a new msg record in User A & User B with FAILED status
  });
});
