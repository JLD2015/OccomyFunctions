// Import libraries
var express = require("express");
var logger = require("morgan");
var firebase = require("firebase-admin");
var firebaseServiceAccountKey = require("./certificates/firebaseServiceAccountKey.json");
var messagingRouter = require("./routes/messaging");
var transactRouter = require("./routes/transact");

// Create Express app
var app = express();

// Setup middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(logger("dev"));

// Setup routes
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
