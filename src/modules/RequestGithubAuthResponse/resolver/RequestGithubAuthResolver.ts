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
    @Arg("code", { nullable: true }) code?: string
  ): Promise<RequestGithubAuthResponse> {
    try {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      const githubUrl = process.env.GITHUB_URL;
      const callbackUrl = process.env.GITHUB_CALLBACK_URL;

      if (!clientId || !callbackUrl || !clientSecret) {
        console.error("Missing GitHub OAuth env vars.");
        throw new Error("Missing GitHub OAuth env vars.");
      }

      if (!code) {
        // If code is not present, start the OAuth process
        const redirectUri = `${callbackUrl}?username=${username}`;
        const url = `${githubUrl}/login/oauth/authorize?client_id=${clientId}&scope=user,user:email&redirect_uri=${encodeURIComponent(redirectUri)}`;

        return {
          success: true,
          url,
          message: "Redirect to GitHub authorization",
        };
      }

      // Step 2: Fetch the GitHub access token
      const tokenResponse = await axios.post(
        `${githubUrl}/login/oauth/access_token`,
        {
          client_id: clientId,
          client_secret: clientSecret,
          code,
        },
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      console.log("Token Response:", tokenResponse.data);  // Debugging log
      const { access_token, error } = tokenResponse.data;

      // Handle possible errors
      if (error) {
        console.error("GitHub OAuth error:", error);
        if (error === "rate_limit") {
          return {
            success: false,
            url: "",
            message: "Rate limit exceeded, please reauthorize the application.",
          };
        }
        throw new Error("Failed to retrieve GitHub access token.");
      }

      if (!access_token) {
        console.error("Access token is missing in response.");
        throw new Error("Failed to retrieve GitHub access token.");
      }

      // Step 3: Fetch user info from GitHub
      const userResponse = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      console.log("GitHub User Data:", userResponse.data);  // Debugging log

      const { id: githubId, avatar_url } = userResponse.data;

     
      const userRepo = dataSource.getRepository(User);
      const user = await userRepo.findOneBy({ username });

      if (!user) {
        console.error("User not found:", username);
        throw new Error("User not found");
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
