import { SonarQubeResolver } from "../../SonarIssues/resolver/SonarQubeResolver";
import { fetchAndStoreRepos } from "../services/fetchAndStoreRepos";
import { postGitHubComment } from "./gitHub.service"; 

const sonarQubeResolver = new SonarQubeResolver();

export async function triggerPRAnalysis(username: string, repo: string, branch: string, prId: number) {
 
 // await fetchAndStoreRepos(username);
  const analysisResult = await sonarQubeResolver.triggerAutomaticPullRequestAnalysis(username,repo);

  const comment = `${analysisResult} for branch \`${branch}\` `;
  console.log("Generated Sonar Comment:", comment);
  try {
    await postGitHubComment(username, repo, prId, comment);
    console.log("Posting GitHub comment:", comment);
  }  catch (err: any) {
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Headers:", err.response.headers);
      console.error("Data:", err.response.data);
    } else {
      console.error("Error Message:", err.message);
    }
  }
  
  return comment;
}
