const createReadStream = require("fs").createReadStream;
const express = require("express");
const firebase = require("firebase-admin");
const formData = require("form-data");
const handlebars = require("handlebars");
const Mailgun = require("mailgun.js");
const path = require("path");
const readFileSync = require("fs").readFileSync;
const router = express.Router();

// Send password reset email
router.post("/resetpassword", async (req, res) => {
  // Get the email address
  if (!req.body.email) {
    res.status(400);
    res.json({ status: "Please provide an email address" });
    return;
  }
  const email = req.body.email;

  // Generate a password reset link
  const actionCodeSettings = {
    url: "https://occomy.com/authentication",
  };

  firebase
    .auth()
    .generatePasswordResetLink(email, actionCodeSettings)
    .then((link) => {
      // Send the password reset email to the user
      const mailgun = new Mailgun(formData);
      const client = mailgun.client({
        username: "api",
        key: "11cca92bdbb4cfa2bcac1dde2e6509b0-0be3b63b-70b4b404",
      });

      let emailTemplateSource = readFileSync(
        path.join(process.cwd(), "emailTemplates", "resetPassword.hbs"),
        "utf8"
      );
      let template = handlebars.compile(emailTemplateSource);
      let htmlToSend = template({
        link: link,
        year: new Date().getFullYear(),
      });

      client.messages
        .create("occomy.com", {
          from: "support@occomy.com",
          to: email,
          subject: "Reset Password",
          html: htmlToSend,
          inline: {
            data: createReadStream(
              path.join(process.cwd(), "assets", "images", "logo.png")
            ),
            filename: "logo.png",
          },
        })
        .then(() => {
          res.status(200);
          res.json({ status: "Success" });
          return;
        });
    })
    .catch(() => {
      res.status(400);
      res.json({ status: "Could not send password reset email" });
      return;
    });
});

// Send account deletion email
router.post("/sendaccountdeletionemail", async (req, res) => {
  // Get the email address
  if (!req.body.email) {
    res.status(400);
    res.json({ status: "Please provide an email address" });
    return;
  }
  const email = req.body.email;

  // Send the account deletion email to the user
  const mailgun = new Mailgun(formData);
  const client = mailgun.client({
    username: "api",
    key: "11cca92bdbb4cfa2bcac1dde2e6509b0-0be3b63b-70b4b404",
  });

  let emailTemplateSource = readFileSync(
    path.join(process.cwd(), "emailTemplates", "accountDeletion.hbs"),
    "utf8"
  );
  let template = handlebars.compile(emailTemplateSource);
  let htmlToSend = template({
    year: new Date().getFullYear(),
  });

  client.messages
    .create("occomy.com", {
      from: "support@occomy.com",
      to: email,
      subject: "Account Deleted",
      html: htmlToSend,
      inline: {
        data: createReadStream(
          path.join(process.cwd(), "assets", "images", "logo.png")
        ),
        filename: "logo.png",
      },
    })
    .then(() => {
      res.status(200);
      res.json({ status: "Success" });
      return;
    });
});

// Send account deletion email
router.post("/sendcontactemails", async (req, res) => {
  res.status(200);
  res.json({ status: "Need to impliment" });
  return;
});

// Send verification email
router.post("/sendverifyemail", async (req, res) => {
  // Get the email address
  if (!req.body.email) {
    res.status(400);
    res.json({ status: "Please provide an email address" });
    return;
  }
  const email = req.body.email;

  // Get the name
  if (!req.body.name) {
    res.status(400);
    res.json({ status: "Please provide a name" });
    return;
  }
  const name = req.body.name;

  // Generate an email verification link
  const actionCodeSettings = {
    url: "https://occomy.com/authentication",
  };

  firebase
    .auth()
    .generateEmailVerificationLink(email, actionCodeSettings)
    .then((link) => {
      // Send the verification email to the user
      const mailgun = new Mailgun(formData);
      const client = mailgun.client({
        username: "api",
        key: "11cca92bdbb4cfa2bcac1dde2e6509b0-0be3b63b-70b4b404",
      });

      let emailTemplateSource = readFileSync(
        path.join(process.cwd(), "emailTemplates", "verifyEmail.hbs"),
        "utf8"
      );
      let template = handlebars.compile(emailTemplateSource);
      let htmlToSend = template({
        name: name,
        link: link,
        year: new Date().getFullYear(),
      });

      client.messages
        .create("occomy.com", {
          from: "noreply@occomy.com",
          to: email,
          subject: "Verify Email Address",
          html: htmlToSend,
          inline: {
            data: createReadStream(
              path.join(process.cwd(), "assets", "images", "logo.png")
            ),
            filename: "logo.png",
          },
        })
        .then(() => {
          res.status(200);
          res.json({ status: "Success" });
          return;
        });
    })
    .catch(() => {
      res.status(400);
      res.json({ status: "Could not send verification email" });
      return;
    });
});

// Export the router
module.exports = router;
