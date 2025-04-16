import { Request, Response } from "express";
import { SonarQubeResolver } from "../modules/SonarIssues/resolver/SonarQubeResolver";

export class WebhookController {
  private readonly resolver = new SonarQubeResolver();

  async handleSonarQubeWebhook(req: Request, res: Response) {
    try {
      const { projectId } = req.query;
      const signature = req.headers["x-sonar-webhook-hmac-sha256"];
      const payload = req.body;

      if (
        process.env.WEBHOOK_SECRET &&
        signature !== process.env.WEBHOOK_SECRET
      ) {
        return res.status(401).send("Unauthorized");
      }

      if (!projectId) {
        return res.status(400).send("Project ID is required");
      }

      const authHeader = `Basic ${Buffer.from(`${process.env.SONARQUBE_API_TOKEN}:`).toString("base64")}`;
      res.status(200).send("OK");
      await this.resolver.handleWebhookEvent(
        projectId as string,
        payload.status,
        authHeader,
      );
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).send("Internal server error");
    }
  }
}
