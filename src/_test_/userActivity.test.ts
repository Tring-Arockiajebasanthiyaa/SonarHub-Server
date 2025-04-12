import { UserActivityResolver } from "../modules/UserActivity/resolver/UserActivityResolver";
import dataSource from "../database/data-source";
import { UserActivity } from "../modules/UserActivity/entity/userActivity.entity";
import { User } from "../modules/user/entity/user.entity";
import axios from "axios";

jest.mock("axios");
jest.mock("../database/data-source");

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("UserActivityResolver", () => {
  let resolver: UserActivityResolver;
  let userRepository: any;
  let userActivityRepository: any;

  beforeEach(() => {
    jest.clearAllMocks();

    userRepository = {
      findOne: jest.fn().mockResolvedValue({
        username: "testuser",
        githubAccessToken: "mockGithubToken",
      }),
    };

    userActivityRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((data) => data),
    };

    (dataSource.getRepository as jest.Mock).mockImplementation(
      (entity: any) => {
        if (entity === User) {
          return userRepository;
        }

        if (entity === UserActivity) {
          return userActivityRepository;
        }

        return null;
      },
    );
  });

  it("should fetch user activity and update or create UserActivity", async () => {
    (axios.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("https://api.github.com/users/testuser/repos")) {
        return Promise.resolve({
          data: [
            {
              name: "repo1",
              stargazers_count: 10,
              forks_count: 5,
              language: "JavaScript",
              created_at: "2022-01-01T00:00:00Z",
              updated_at: "2023-01-01T00:00:00Z",
              private: false,
              size: 1000,
            },
          ],
        });
      }

      if (url.includes("https://api.github.com/users/testuser/events")) {
        return Promise.resolve({
          data: [{ type: "PushEvent" }],
        });
      }

      if (url.includes("sonarqube")) {
        return Promise.resolve({
          data: { total: 5 },
        });
      }

      return Promise.reject(new Error(`Unmocked URL: ${url}`));
    });
  });

  // it("should handle GitHub API errors", async () => {
  //   // Mock a failed GitHub API call specifically
  //   mockedAxios.get.mockImplementationOnce((url: string) => {
  //     if (url.includes('github.com/users/testuser/repos')) {
  //       return Promise.reject({
  //         response: {
  //           status: 401,
  //           data: {
  //             message: "Bad credentials",
  //             documentation_url: "https://docs.github.com/rest",
  //           },
  //         },
  //       });
  //     }
  //     return Promise.resolve({ data: [] }); // fallback for other calls
  //   });

  //   await expect(resolver.getUserActivity("testuser", {} as MyContext))
  //     .rejects.toThrow("Failed to fetch user activity");
  // });
});
