// Import libraries
const cors = require("cors");
const express = require("express");
const logger = require("morgan");
const firebase = require("firebase-admin");
const firebaseServiceAccountKey = require("./certificates/firebaseServiceAccountKey.json");
const authRouter = require("./routes/auth");
const emailRouter = require("./routes/email");
const messagingRouter = require("./routes/messaging");
const transactRouter = require("./routes/transact");

// Create Express app
const app = express();

// Setup middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(logger("dev"));

// Setup routes
app.use("/auth", authRouter);
app.use("/email", emailRouter);
app.use("/messaging", messagingRouter);
app.use("/transact", transactRouter);

// Initialise firebase
firebase.initializeApp({
  credential: firebase.credential.cert(firebaseServiceAccountKey),
});

// To check if server is running
app.get("/", (req, res) => {
  res.send("<div>Occomy functions server running</div>");
});

module.exports = app;
