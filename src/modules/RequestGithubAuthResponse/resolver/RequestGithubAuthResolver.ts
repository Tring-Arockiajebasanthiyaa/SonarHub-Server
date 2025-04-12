import { Arg, Mutation, Resolver } from "type-graphql";
import { RequestGithubAuthResponse } from "../types/RequestGithubAuthResponse";
import "reflect-metadata";
import dotenv from "dotenv";
import axios from "axios";
import { User } from "../../user/entity/user.entity";
import dataSource from "../../../database/data-source";

dotenv.config();

@Resolver()
export class RequestGithubAuthResolver {
  @Mutation(() => RequestGithubAuthResponse)
  async requestGithubAuth(
    @Arg("username") username: string,
    @Arg("code", { nullable: true }) code?: string,
  ): Promise<RequestGithubAuthResponse> {
    try {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      const githubUrl = process.env.GITHUB_URL;
      const callbackUrl = process.env.GITHUB_CALLBACK_URL;
      const GITHUB_API_URL = process.env.GITHUB_API;
      if (!clientId || !callbackUrl || !clientSecret) {
        console.error("Missing GitHub OAuth env vars.");
        throw new Error("Missing GitHub OAuth env vars.");
      }

      if (!code) {
        const redirectUri = `${callbackUrl}?username=${username}`;
        const url = `${githubUrl}/login/oauth/authorize?client_id=${clientId}&scope=repo,user,user:email&redirect_uri=${encodeURIComponent(redirectUri)}`;

        return {
          success: true,
          url,
          message: "Redirect to GitHub authorization",
        };
      }

      const tokenResponse = await axios.post(
        `${githubUrl}/login/oauth/access_token`,
        {
          client_id: clientId,
          client_secret: clientSecret,
          code,
        },
        {
          headers: { Accept: "application/json" },
        },
      );

      const { access_token, error } = tokenResponse.data;

      if (error || !access_token) {
        console.error("GitHub OAuth token error:", error);
        throw new Error("Failed to retrieve GitHub access token.");
      }

      const userResponse = await axios.get(`${GITHUB_API_URL}/user`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const { id: githubId, avatar_url } = userResponse.data;

      const scopeCheck = await axios.get(`${GITHUB_API_URL}`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      console.log("Granted Scopes:", scopeCheck.headers["x-oauth-scopes"]);

      const userRepo = dataSource.getRepository(User);
      const user = await userRepo.findOneBy({ username });

      if (!user) {
        throw new Error(`User not found for username: ${username}`);
      }

      user.githubId = githubId.toString();
      user.avatar = avatar_url;
      user.githubAccessToken = access_token;

      await userRepo.save(user);

      return {
        success: true,
        url: "",
        message: "GitHub access token saved successfully",
      };
    } catch (error: any) {
      console.error("GitHub Auth Error:", error);
      return {
        success: false,
        url: "",
        message: error.message || "GitHub Auth Failed",
      };
    }
  }
}
