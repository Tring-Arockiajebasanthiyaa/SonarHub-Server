import express from "express";
import passport from "passport";
import dataSource from "../database/data-source";
import { User } from "../modules/user/entity/user.entity";
import dotenv from "dotenv";
dotenv.config();
const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL;

router.get("/auth/github", passport.authenticate("github", { scope: ["user:email"] }));

router.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/login" }),
  async (req, res) => {
    try {
      console.log("GitHub callback entered");

      const sessionUser = req.user as User; // Ensure this is properly mocked in tests

      if (!sessionUser || !sessionUser.u_id) {
        console.error("Session user or user ID missing");
        return res.redirect(`${FRONTEND_URL}/login?message=Login%20failed`); // Added query params for the test case
      }

      const userRepository = dataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { u_id: sessionUser.u_id }, select: ["u_id", "password"] });

      if (!user) {
        console.error("User not found in DB");
        return res.redirect("http://localhost:5173/login?message=User%20not%20found");
      }

      const needsPassword = !user.password;

      if (needsPassword) {
        console.log("User needs to set a password");
        return res.redirect("http://localhost:5173/set-password");
      } else {
        console.log("User login successful, redirecting to homepage");
        return res.redirect("http://localhost:5173/");
      }
    } catch (error) {
      console.error("GitHub callback error:", error);
      return res.redirect("http://localhost:5173/login?message=Error%20occurred");
    }
  }
);

export default router;
