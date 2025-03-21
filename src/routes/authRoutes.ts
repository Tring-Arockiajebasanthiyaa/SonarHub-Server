import express from "express";
import passport from "passport";
import {User} from "../modules/user/entity/user.entity";
import "reflect-metadata";
const router = express.Router();

// Redirect to GitHub for authentication
router.get("/auth/github", passport.authenticate("github", { scope: ["user:email"] }));

// GitHub callback after authentication
router.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/login" }),
  (req, res) => {
    // Successful authentication, redirect to the frontend
    res.redirect("http://localhost:5173/set-password");
  }
);

export default router;