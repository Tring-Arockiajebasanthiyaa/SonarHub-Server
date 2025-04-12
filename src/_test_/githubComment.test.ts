import { GitHubCommentResolver } from "../modules/GithubComments/resolver/GithubComment"; 
import { User } from "../modules/user/entity/user.entity";
import axios from "axios";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockFindOne = jest.fn();

jest.mock("../database/data-source", () => ({
  __esModule: true,
  default: {
    getRepository: jest.fn().mockImplementation((entity) => {
      if (entity === User) {
        return { findOne: mockFindOne };
      }
      throw new Error("Unknown repository entity");
    }),
  },
}));

describe("GitHubCommentResolver", () => {
  const resolver = new GitHubCommentResolver();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should throw an error if user not found or no GitHub access token", async () => {
    mockFindOne.mockResolvedValue(null); 

    await expect(resolver.getPRComments("testuser", "testrepo", 1)).rejects.toThrow(
      "GitHub token not found for this user."
    );
  });

  it("should fetch PR comments successfully", async () => {
   
    mockFindOne.mockResolvedValue({
      githubAccessToken: "mock-token",
    });

    
    mockedAxios.get.mockResolvedValue({
      data: [
        {
          id: 1,
          body: "Great work!",
          user: { login: "testuser" },
          created_at: "2025-04-12T12:00:00Z",
        },
      ],
    });

    const result = await resolver.getPRComments("testuser", "testrepo", 1);

    expect(mockFindOne).toHaveBeenCalledWith({
      where: { username: "testuser" },
      select: ["githubAccessToken"],
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${process.env.GITHUB_API}/repos/testuser/testrepo/issues/1/comments`,
      {
        headers: {
          Authorization: `token mock-token`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    expect(result).toEqual([
      {
        id: "1",
        body: "Great work!",
        userLogin: "testuser",
        createdAt: "2025-04-12T12:00:00Z",
      },
    ]);
  });

  it("should throw an error if GitHub API request fails", async () => {
    mockFindOne.mockResolvedValue({
      githubAccessToken: "mock-token",
    });

    mockedAxios.get.mockRejectedValue(new Error("GitHub API error"));

    await expect(resolver.getPRComments("testuser", "testrepo", 1)).rejects.toThrow(
      "GitHub API error"
    );
  });
});
