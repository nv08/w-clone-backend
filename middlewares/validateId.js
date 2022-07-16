import { db } from "../connection.js";

const validateId = async (req, res, next) => {
  try {
    const { senderId, receiverId, msgId } = req.body;
    if (!senderId || !receiverId || !msgId) {
      res.status(400).send({ status: "failed", msg: "missing ids" });
      return;
    }
    // const validIDs = await db
    //   .db()
    //   .collection("users")
    //   .find({ userId: { $in: [senderId, receiverId] } })
    //   .count();


    // if (validIDs !== 2) {
    //   res.status(403).send({ status: "failed", msg: "invalid users" });
    // } else {
    //   next();
    // }
    next();
  } catch (err) {
    console.log(err);
    res.status(500).send({ status: "failed", msg: "internal server error" });
  }
};

export { validateId };
