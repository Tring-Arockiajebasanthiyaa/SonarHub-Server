import { AuthResolver } from "../modules/user/resolvers/authResolver";
import dataSource from "../database/data-source";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

jest.mock("../database/data-source");
jest.mock("bcrypt");
jest.mock("jsonwebtoken");

describe("User SignIn", () => {
  const mockFindOne = jest.fn();
  const mockInitialize = jest.fn();

  beforeEach(() => {
    (dataSource.getRepository as jest.Mock).mockReturnValue({
      findOne: mockFindOne,
    });
    (dataSource.isInitialized as boolean) = false;
    (dataSource.initialize as jest.Mock) = mockInitialize.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should return JWT token for valid credentials", async () => {
   
    const resolver = new AuthResolver();
    const mockUser = {
      u_id: "123",
      email: "user@example.com",
      password: "hashed_password",
    };
    mockFindOne.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    process.env.JWT_SECRET = "test_secret";
    (jwt.sign as jest.Mock).mockReturnValue("mock_jwt_token");
    const result = await resolver.signIn("user@example.com", "correct_password");
    expect(mockInitialize).toHaveBeenCalled();
    expect(mockFindOne).toHaveBeenCalledWith({ where: { email: "user@example.com" } });
    expect(bcrypt.compare).toHaveBeenCalledWith("correct_password", "hashed_password");
    expect(result).toBe("mock_jwt_token");
  });
});
