import { GitHubResolver } from "../modules/GitHubRepository/resolver/GitHubResolver"; 
import { User } from "../modules/user/entity/user.entity";
import { Repo } from "../modules/GitHubRepository/entity/Repo.entity";
import fetch from "node-fetch";

jest.mock("node-fetch", () => jest.fn());
const mockedFetch = fetch as unknown as jest.Mock;

const mockFindOne = jest.fn();
const mockRepoSave = jest.fn();
const mockRepoFindOne = jest.fn();
const mockRepoCreate = jest.fn();

jest.mock("../database/data-source", () => ({
  __esModule: true,
  default: {
    getRepository: jest.fn().mockImplementation((entity) => {
      if (entity === User) {
        return {
          findOne: mockFindOne,
        };
      }
      if (entity === Repo) {
        return {
          findOne: mockRepoFindOne,
          save: mockRepoSave,
          create: mockRepoCreate,
        };
      }
      throw new Error("Unknown repository entity passed to mock.");
    }),
  },
}));

describe("GitHubResolver.getUserRepositories", () => {
  const resolver = new GitHubResolver();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch user repositories and return Repo entities", async () => {
   
    mockFindOne.mockResolvedValue({
      u_id: 1,
      username: "testuser",
      githubAccessToken: "mock-token",
    });

    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            name: "test-repo",
            language: "JavaScript",
            stargazers_count: 5,
            commits_url: "https://api.github.com/repos/testuser/test-repo/commits{/sha}",
          },
        ],
      })
      
      .mockResolvedValueOnce({
        json: async () => [{}, {}, {}], 
      });

    
    mockRepoFindOne.mockResolvedValue(null); 
    const createdRepo = {
      name: "test-repo",
      language: "JavaScript",
      stars: 5,
      totalCommits: 3,
    };
    
    mockRepoCreate.mockReturnValue(createdRepo);
    mockRepoSave.mockResolvedValue(createdRepo); 
    
        
    const result = await resolver.getUserRepositories("testuser");

    expect(mockFindOne).toHaveBeenCalledWith({
      where: { username: "testuser" },
      select: ["u_id", "username", "githubAccessToken"],
    });

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockRepoCreate).toHaveBeenCalled();
    expect(mockRepoSave).toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        name: "test-repo",
        language: "JavaScript",
        stars: 5,
        totalCommits: 3,
      }),
    ]);
  });

  it("should throw error if user not found", async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(resolver.getUserRepositories("invalidUser")).rejects.toThrow(
      "User not found or GitHub access token is missing!"
    );
  });

  it("should throw error if GitHub API fails", async () => {
    mockFindOne.mockResolvedValue({
      u_id: 1,
      username: "testuser",
      githubAccessToken: "mock-token",
    });

    mockedFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        message: "Bad credentials",
      }),
    });

    await expect(resolver.getUserRepositories("testuser")).rejects.toThrow(
      "GitHub API error: Bad credentials"
    );
  });
});
