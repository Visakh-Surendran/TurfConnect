const path = require("path");
const Razorpay = require("razorpay");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const isConfigured = Boolean(
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET &&
  process.env.RAZORPAY_KEY_ID !== "rzp_test_placeholder" &&
  process.env.RAZORPAY_KEY_SECRET !== "rzp_secret_placeholder"
);

let razorpayInstance = null;

if (isConfigured) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
} else {
  console.warn(
    "[Razorpay] Using placeholder credentials. Real Razorpay orders require valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env"
  );
}

module.exports = {
  razorpay: razorpayInstance,
  isRazorpayConfigured: () => Boolean(razorpayInstance),
};
