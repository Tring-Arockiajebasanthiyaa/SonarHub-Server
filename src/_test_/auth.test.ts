import express, { json } from "express";
import passport from "passport";
import request from "supertest";
import dataSource from "../database/data-source";
import authRouter from "../routes/authRoutes";
import dotenv from "dotenv";


import "../cronJob/cronJob";
import { WebhookController } from "../controllers/webhook.controller";

dotenv.config();

// // Mock passport and other dependencies
// jest.mock("passport", () => ({
//   authenticate: jest.fn().mockReturnValue((req: any, res: any, next: () => any) => next()),
// }));

// jest.mock("../database/data-source");
jest.mock("express", () => {
  const mockExpress :any= jest.fn(() => ({
    use: jest.fn(),
    post: jest.fn(),
    listen: jest.fn().mockImplementation((port, callback) => {
      callback();  // Simulate the callback being called when listen is invoked
      return { address: '127.0.0.1', port: 4000 }; // Mocked response of listen
    }),
    disable: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    address: jest.fn(() => ({ port: 4000 })),  // Ensure address method is correctly mocked
    _router: {
      stack: [] // Often needed by supertest
    }
  }));
  mockExpress.json = jest.fn();
  mockExpress.static = jest.fn();
  return mockExpress;
});

jest.mock("../database/data-source", () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  getRepository: jest.fn().mockResolvedValue(null)
}));
jest.mock("../config/passport", () => ({
  initialize: jest.fn(),
  session: jest.fn(),
}));
jest.mock("@apollo/server", () => ({
  ApolloServer: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock("@apollo/server/express4", () => ({
  expressMiddleware: jest.fn(),
}));
jest.mock("../routes/authRoutes", () => jest.fn());
jest.mock("../controllers/webhook.controller", () => ({
  WebhookController: jest.fn().mockImplementation(() => ({
    handleSonarQubeWebhook: jest.fn(),
  })),
}));


describe("GitHub Authentication Routes", () => {
  let app: express.Application;
  const mockUser = { u_id: "12345", password: "hashedPassword" };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(authRouter); 
    const webhookController = new WebhookController();
    app.post('/webhook', (req, res) => webhookController.handleSonarQubeWebhook(req, res));

 
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockPassport = (user: any, shouldFail = false) => {
    passport.authenticate = jest.fn().mockImplementation((strategy, options, callback) => {
      return (req: any, res: any, next: any) => {
        if (shouldFail) {
          return res.redirect(`${process.env.FRONTEND_URL}/login?message=Login%20failed`);
        }
        req.user = user;
        next(); 
      };
    });
  };

  it("should redirect to frontend with success message when login is successful", async () => {
    mockPassport(mockUser); 
    const mockRepo = { findOne: jest.fn().mockResolvedValue(mockUser) };
    (dataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);

    const response = await request(app)
      .get("/auth/github/callback")
      .set("Cookie", ["connect.sid=test"]);

    expect(response.status).toBe(302);
  });
  
 
});
