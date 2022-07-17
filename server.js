import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import BodyParser from "body-parser";
import { v4 as uuid } from "uuid";
import { db } from "./connection.js";
import { validateId } from "./middlewares/validateId.js";
import cors from "cors";
import {
  getSocketId,
  removeUserFromSocketMap,
  upsertUserToSocketMap,
} from "./socketMap.js";

const app = express();

app.use(cors());
app.use(BodyParser.json());
app.use(BodyParser.urlencoded({ extended: true }));
var http = createServer(app);
const io = new Server(http, {
  cors: {
    origin: "*",
  },
});

// io.use((socket, next) => {
//   const userId = socket.handshake.auth.userId;
//   if (!userId) {
//     return next(new Error("invalid"));
//   }
//   socket.userId = userId;
//   next();
// });

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
  if (!phone || !password) {
    res.status(400).send({ status: "failed", msg: "invalid credentials" });
    return;
  }
  try {
    const user = await db
      .db()
      .collection("users")
      .findOne({ phone, password }, { projection: { password: 0, _id: 0 } });
    if (user && user.userId) {
      res.send({ status: "success", data: user });
    } else {
      res.status(401).send({
        status: "failed",
        msg: "invalid credentials",
      });
    }
  } catch (err) {
    res.status(500).send({ status: "failed", msg: "server error" });
  }
});

app.post("/sendMessage", validateId, async (req, res) => {
  try {
    const { senderId, receiverId, message, msgId } = req.body;
    const createdAt = Date.now();
    let status = "sent";
    const msgObj = { senderId, receiverId, msgId, message, createdAt };

    const socket = getSocketId(receiverId);

    socket &&
        socket.emit("msg-receive", msgObj, (confirmation) => {
        console.log(confirmation, "confirm");
        if (confirmation.status) {
          status = confirmation.status;
        }
      });

    const response = await db
      .db()
      .collection("chat")
      .insertOne({ ...msgObj, status });

    if (response.acknowledged) {
      res.send({ status: "success", data: { ...msgObj, status } });
    } else {
      res.status(422).send({ status: "failed", msg: "Entry not processed" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).send({ status: "failed", msg: "internal server error" });
  }
});

app.post("/searchUser", async (req, res) => {
  try {
    const { phone } = req.body;
    const response = await db
      .db()
      .collection("users")
      .findOne({ phone }, { projection: { _id: 0, password: 0 } });

    if (response) {
      res.send({ status: "success", data: response });
      return;
    }
    res.status(404).send({ status: "failed", msg: "phone not registered" });
  } catch (err) {
    console.log(err);
    res.status(500).send({ status: "failed", msg: "internal server error" });
  }
});

app.post("/getLastConversations", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).send({ status: "failed", msg: "missing fields" });
      return;
    }

    const q = {
      match: { $or: [{ receiverId: userId }, { senderId: userId }] },
      addFields: {
        me: {
          $cond: [{ $ne: ["$senderId", userId] }, "$receiverId", "$senderId"],
        },
        other: {
          $cond: [{ $ne: ["$senderId", userId] }, "$senderId", "$receiverId"],
        },
      },
      sort: { createdAt: -1 },
      replaceRoot: { newRoot: "$document" },
      lookup: {
        from: "users",
        let: { receiverId: "$other" },
        as: "userDetails",
        pipeline: [
          {
            $match: { $expr: { $and: [{ $eq: ["$userId", "$$receiverId"] }] } },
          },
        ],
      },
      unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true },
      group: {
        _id: { me: "$me", other: "$other" },
        document: { $last: "$$ROOT" },
      },
      project: {
        _id: 0,
        msgId: 1,
        senderId: 1,
        receiverId: 1,
        message: 1,
        createdAt: 1,
        status: {
          $cond: {
            if: { $eq: ["$senderId", userId] },
            then: "$$REMOVE",
            else: "$status",
          },
        },
        userDetails: 1,
      },
    };
    await db
      .db()
      .collection("chat")
      .aggregate([
        { $match: q.match },
        { $addFields: q.addFields },
        { $group: q.group },
        { $replaceRoot: q.replaceRoot },
        { $lookup: q.lookup },
        { $unwind: q.unwind },
        { $sort: q.sort },
        { $project: q.project },
      ])
      .toArray((err, result) => {
        if (!err) {
          res.send({ status: "success", data: result.length ? result : [] });
        } else {
          throw new Error("some error occured");
        }
      });
  } catch (err) {
    if (err.message) {
      res.status(422).send(err.message);
    } else {
      res.status(500).send({ status: "failed", msg: "internal server error" });
    }
  }
});

app.post("/getRoomById", validateId, async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    if (!senderId || !receiverId) {
      res.status(400).send({ status: "failed", msg: "missing fields" });
      return;
    }

    await db
      .db()
      .collection("chat")
      .find({
        $or: [
          { $and: [{ senderId: senderId }, { receiverId: receiverId }] },
          { $and: [{ senderId: receiverId }, { receiverId: senderId }] },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray((err, result) => {
        if (!err) {
          res.send({ status: "success", data: result });
          return;
        }
      });
  } catch (err) {
    console.log(err);
    res.status(500).send({ status: "failed", msg: "internal server error" });
  }
});

app.post("/roomOpen", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    if (!senderId || !receiverId) {
      res.status(400).send({ status: "failed", msg: "missing fields" });
      return;
    }

    const response = await db
      .db()
      .collection("chat")
      .update({ senderId, receiverId }, { $set: { status: "read" } });

    if (response.acknowledged) {
      res.send({ status: "success", data: [] });
    } else {
      res.status(422).send({ status: "failed", msg: "some error" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).send({ status: "failed", msg: "internal server error" });
  }
});

http.listen(process.env.PORT || 80, () => {
  console.log("server started");
});

io.on("connection", (socket) => {
  upsertUserToSocketMap(socket.handshake.auth.userId, socket);
  // socket.emit("msg-receive", "x", function (cnf) {
  //   console.log(cnf);
  // });
  // socket.onAny((event, ...args) => {
  //   console.log(event, args);
  // });
  // const userId = socket.handshake.auth.userId;
  // upsertUserToSocketMap(userId);

  // console.log(io.sockets);
  // socket.emit("user-id", { id: socket.id });

  // socket.on("disconnect", () => {
  //   console.log("Client disconnected");
  // });

  // // this is the handler when user A sends msg to user B
  // socket.on("msg-send", function (msg, id, callback) {
  //   console.log("Received a chat message", msg, id);
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
  //});
  socket.on("disconnect", () => {
    removeUserFromSocketMap(socket.handshake.auth.userId);
  });
});
