import bcrypt from "bcryptjs";
import User from "../models/User";

const KNOWN_WEAK_PASSWORDS = new Set([
  "admin123", "password", "admin", "123456", "password123", "admin1234",
]);

export async function createDefaultAdmin() {
  const adminEmail    = process.env.ADMIN_EMAIL;
  const adminName     = process.env.ADMIN_NAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminName || !adminPassword) {
    console.log("Admin user not created: admin not set in .env");
    return;
  }

  if (KNOWN_WEAK_PASSWORDS.has(adminPassword) || adminPassword.length < 12) {
    console.error(
      "[SECURITY] ADMIN_PASSWORD is too weak or matches a known default. " +
      "Update ADMIN_PASSWORD in your .env to a strong password before deploying."
    );
    process.exit(1);
  }

  const anyAdmin = await User.findOne({ role: "admin" });

  // Update that admin's email, name and password.
  if (anyAdmin) {
    /*
    console.log("An admin account already exists");
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    anyAdmin.name = adminName;
    anyAdmin.email = adminEmail;
    anyAdmin.hash = hashedPassword;
    await anyAdmin.save();
    console.log("Existing admin updated to match .env (email/name/password).");
    */
    return;
  }

  // No admin exists, create one
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  await User.create({
    name: adminName,
    email: adminEmail,
    hash: hashedPassword,
    role: "admin"
  });

  console.log(`Admin user created: name=${adminName}, email=${adminEmail}`);
}