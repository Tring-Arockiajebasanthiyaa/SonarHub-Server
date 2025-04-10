import axios from "axios";
import dotenv from "dotenv";
import dataSource from "../../../database/data-source";
import { User } from "../../user/entity/user.entity";
dotenv.config();

const GITHUB_API_URL=process.env.GITHUB_API;

export async function postGitHubComment(
    owner: string,
    repo: string,
    prNumber: number,
    comment: string
  ) {
    const userRepository = dataSource.getRepository(User);
  
    const user = await userRepository.findOne({
      where: { username: owner },
      select: ["githubAccessToken"]
    });
  
    if (!user) {
      console.log(`User with GitHub username '${owner}' not found.`);
      return null;
    }
  
    const userGithubToken = user.githubAccessToken;
  
    if (!userGithubToken) {
      console.log(`No GitHub token found for user '${owner}'.`);
      throw new Error("GitHub access token is missing for this user.");
    }
    const finalUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/issues/${prNumber}/comments`;
    console.log("Posting comment to URL:", finalUrl);

    await axios.post(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      { body: comment },
      {
        headers: {
          Authorization: `token ${userGithubToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
   
    console.log(`Comment posted to PR #${prNumber} in ${owner}/${repo}`,comment);
  }
  
