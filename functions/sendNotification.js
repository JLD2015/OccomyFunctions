const apn = require("apn");
const path = require("path");

function APNsNotification(deviceToken, title, body, callback) {
  let provider = new apn.Provider({
    token: {
      key: path.join(process.cwd(), "./certificates/apnskey.p8"),
      keyId: "CSV4ZA2D57",
      teamId: "838HD9T5J5",
    },
    production: true,
  });

  var notification = new apn.Notification();
  notification.alert = {
    title: title,
    body: body,
  };
  notification.mutableContent = true;
  notification.sound = "bingbong.aiff";
  notification.topic = "com.occomy.Occomy";

  provider.send(notification, deviceToken).then((result) => {
    // see documentation for an explanation of result
    if (result.failed.length > 0) {
      // If we have a bad token, remove it from the database
      callback("Failed", result.failed[0].device);
    } else {
      // If the notification was successful we don't have to do anything
      callback("Success", null);
    }

    // Shut down the provider once the notification has been sent
    provider.shutdown();
  });
}

module.exports = { APNsNotification };
