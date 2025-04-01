import cron from "node-cron";
import { SonarQubeResolver } from "../modules/SonarIssues/resolver/SonarQubeResolver"; 
import dataSource from "../database/data-source";
import { User } from "../modules/user/entity/user.entity"

const sonarQubeResolver = new SonarQubeResolver();

async function runAnalysisForAllUsers() {
  console.log("Running SonarQube analysis for all users...");

  try {
    const userRepo = dataSource.getRepository(User);
    const users = await userRepo.find();

    if (users.length === 0) {
      console.log("No users found for analysis.");
      return;
    }

    for (const user of users) {
      console.log(`Triggering analysis for user: ${user.username}`);
      try {
        const result = await sonarQubeResolver.triggerAutomaticAnalysis(user.username);
        console.log(result);
      } catch (error) {
        console.error(`Error analyzing ${user.username}:`, error);
      }
    }

    console.log("SonarQube analysis completed for all users.");
  } catch (error) {
    console.error("Error fetching users:", error);
  }
}

cron.schedule("0 0 * * *", runAnalysisForAllUsers);

console.log("Cron job scheduled for all users.");
