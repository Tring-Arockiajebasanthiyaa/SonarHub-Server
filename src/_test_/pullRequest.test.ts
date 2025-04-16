import { PullRequestResolver } from "../modules/PullRequest/resolver/pullRequestResolver";
import axios from "axios";
import dataSource from "../database/data-source"
import { PullRequest } from "../modules/PullRequest/entity/pullRequest.entity";
import { Repo } from "../modules/GitHubRepository/entity/Repo.entity";
import { User } from "../modules/user/entity/user.entity";

jest.mock("axios");
jest.mock("../database/data-source", () => ({
  __esModule: true,
  default: {
    getRepository: jest.fn(),
  },
}));
const mockedAxiosGet = axios.get as jest.Mock;

describe("PullRequestResolver", () => {
  const resolver = new PullRequestResolver();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch and save pull requests correctly", async () => {
    const mockFindOneOrFail = jest.fn();
    const mockFindOne = jest.fn();
    const mockFind = jest.fn().mockResolvedValue([]);
    const mockSave = jest.fn();
    const mockUpdate = jest.fn();
    const mockCreate = jest.fn((input) => input); 

    const mockUserRepo = { findOneOrFail: jest.fn().mockResolvedValue({ githubAccessToken: "mockToken" }) };
    const mockRepoRepo = { findOneOrFail: jest.fn().mockResolvedValue({ id: 1, name: "test-repo", owner: { username: "testUser" } }) };
    
    const mockPullRequestRepo = {
      find: mockFind,
      findOne: jest.fn(),
      save: mockSave,
      update: mockUpdate,
      create: mockCreate,
    };
    

    (dataSource.getRepository as jest.Mock).mockImplementation((entity) => {
      if (entity === PullRequest) return mockPullRequestRepo;
      if (entity === User) return mockUserRepo;
      if (entity === Repo) return mockRepoRepo;
    });

    mockedAxiosGet
      .mockResolvedValueOnce({
        data: [
          {
            number: 1,
            title: "Fix bug",
            state: "open",
            head: { ref: "feature-branch" },
            user: { login: "testUser" },
            created_at: "2025-04-12T12:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          additions: 10,
          deletions: 2,
          changed_files: 5,
        },
      });

    const result = await resolver.getPullRequestsByBranch("feature-branch", "test-repo", "testUser", {} as any);

    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
      prId: 1,
      title: "Fix bug",
      state: "open",
      author: "testUser",
    }));

    expect(result).toEqual([]);
  });
});
