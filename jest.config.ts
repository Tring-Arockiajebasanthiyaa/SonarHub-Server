import { Config } from "jest";

const config: Config = {
  coverageProvider: "v8",
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  testPathIgnorePatterns: ["/node_modules/"],
  collectCoverage: true,
  coverageDirectory: "./coverage",
  coverageReporters: ["text", "lcov"],
};

export default config;
