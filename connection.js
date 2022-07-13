import { MongoClient } from "mongodb";
import { config } from "dotenv";

// config({ path: ".env" });

const MONGO_URL = process.env.DB_URL;

var db;
MongoClient.connect(MONGO_URL, (err, dbClient) => {
  if (err) {
    console.log("error occured", err);
    return;
  }
  if (dbClient) {
    db = dbClient;
  }
});

export { db };
