import axios from "axios";
import { Repo } from "../../GitHubRepository/entity/Repo.entity";
import { User } from "../../user/entity/user.entity";
import dataSource from "../../../database/data-source";
import dotenv from "dotenv";
dotenv.config();

const GITHUB_API_URL = process.env.GITHUB_API;
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

export async function fetchAndStoreRepos(username: string) {
  const userRepo = dataSource.getRepository(User);
  const repoRepo = dataSource.getRepository(Repo);

  const user = await userRepo.findOne({
    where: { username },
    select: ["u_id", "githubAccessToken"]
  });

  if (!user) {
    throw new Error(`User '${username}' not found`);
  }

  let accessToken: string;
  if (!user.githubAccessToken) {
    try {
      const tokenResponse = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        },
        {
          headers: {
            Accept: "application/json"
          }
        }
      );

      accessToken = tokenResponse.data.access_token;
      if (!accessToken) {
        throw new Error("Access token not returned from GitHub");
      }

      user.githubAccessToken = accessToken;
      await userRepo.save(user);
    } catch (err: any) {
      throw new Error("Failed to obtain access token");
    }
  } else {
    accessToken = user.githubAccessToken;
  }

  let repos;
  try {
    const response = await axios.get(`${GITHUB_API_URL}/user/repos`, {
      headers: {
        Authorization: `token ${accessToken}`
      },
      params: {
        visibility: "all",  
        per_page: 100      
      }
    });

    repos = response.data;
  } catch (error: any) {
    throw new Error("Failed to fetch repositories from GitHub");
  }

  const savePromises = repos.map(async (repo: any) => {
    const existingRepo = await repoRepo.findOne({
      where: { name: repo.name, owner: { u_id: user.u_id } },
      relations: ["owner"]
    });

    const newLanguage = repo.language ?? null;
    const newStars = repo.stargazers_count ?? 0;

    if (existingRepo) {
      let updated = false;

      if (existingRepo.language !== newLanguage) {
        existingRepo.language = newLanguage;
        updated = true;
      }

      if (existingRepo.stars !== newStars) {
        existingRepo.stars = newStars;
        updated = true;
      }

      if (updated) {
        await repoRepo.save(existingRepo);
      }
    } else {
      const newRepo = repoRepo.create({
        name: repo.name,
        language: newLanguage,
        stars: newStars,
        totalCommits: 0,
        owner: user
      });

      await repoRepo.save(newRepo);
    }
  });

  await Promise.all(savePromises);
  return repos;
}
