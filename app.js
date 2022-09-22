// Import libraries
var express = require("express");
var logger = require("morgan");
var firebase = require("firebase-admin");
var firebaseServiceAccountKey = require("./certificates/firebaseServiceAccountKey.json");
var transactRouter = require("./routes/transact");

// Create Express app
var app = express();

// Setup middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(logger("dev"));

// Setup routes
app.use("/transact", transactRouter);

// Initialise firebase
firebase.initializeApp({
  credential: firebase.credential.cert(firebaseServiceAccountKey),
});

// Export module
app.listen(3000, () => {
  console.log(`Example app listening on port ${3000}`);
});
