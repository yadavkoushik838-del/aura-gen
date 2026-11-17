import "dotenv/config";
import { connectDatabase, getApplicationsCollection, closeDatabase } from "./src/database.js";

try {
  await connectDatabase();

  const application = await getApplicationsCollection().findOne(
    { applicationId: "AG-727E0DA0" },
    { projection: { _id: 0, applicationId: 1, status: 1, submittedAt: 1 } }
  );

  if (application) {
    console.log("MONGODB VERIFICATION: SUCCESS");
    console.log("Application ID:", application.applicationId);
    console.log("Status:", application.status);
    console.log("Submitted:", application.submittedAt);
  } else {
    console.log("MONGODB VERIFICATION: NOT FOUND");
  }
} catch (error) {
  console.log("VERIFICATION ERROR:", error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
