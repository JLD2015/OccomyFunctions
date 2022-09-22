const crypto = require("crypto");
const algorithm = "aes-256-ctr";
const ENCRYPTION_KEY = Buffer.from(
  "2f57d0501b43330e8bdebff21d64ecb53e318337240973a181cc1a480d6cdcef",
  "hex"
);
const IV_LENGTH = 16;

function encrypt(text) {
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv(
    algorithm,
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text) {
  let textParts = text.split(":");
  let iv = Buffer.from(textParts.shift(), "hex");
  let encryptedText = Buffer.from(textParts.join(":"), "hex");
  let decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

function GenerateNewKey() {
  console.log("<==========>");
  console.log(crypto.randomBytes(32).toString("hex"));
  console.log("<==========>");
}

module.exports = {
  encrypt,
  decrypt,
  GenerateNewKey,
};
