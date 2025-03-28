import passport from "passport";
import { Strategy as GitHubStrategy, Profile } from "passport-github2";
import { User } from "../modules/user/entity/user.entity";
import dataSource from "../database/data-source";
import jwt from "jsonwebtoken";
import axios from "axios";
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: process.env.GITHUB_CALLBACK_URL!,
      scope: ["user:email", "repo"], 
      passReqToCallback: true,
    },
    async (
      req: Express.Request,
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done: (error: any, user?: any) => void
    ) => {
      try {
        console.log("GitHub Profile:", profile);
        console.log("Access Token:", accessToken); 

        let user = await dataSource.getRepository(User).findOne({
          where: { githubId: profile.id },
        });

        if (!user) {
          const username = profile.username || `github_${profile.id}`;

          user = dataSource.getRepository(User).create({
            name: profile.displayName || profile.username,
            email: profile.emails?.[0]?.value || `${profile.username}@github.com`,
            username,
            githubId: profile.id,
            githubAccessToken: accessToken,
          });

          await dataSource.getRepository(User).save(user);
        } else {
          user.githubAccessToken = accessToken;
          await dataSource.getRepository(User).save(user);
        }
       
        const token = jwt.sign({ u_id: user.u_id }, process.env.JWT_SECRET!, {
          expiresIn: "1d",
        });

        done(null, { user, token });
      } catch (error) {
        console.error("GitHub Strategy Error:", error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((data: any, done) => {
  done(null, data?.user?.u_id || null);
});

passport.deserializeUser(async (u_id: string, done) => {
  try {
    if (!u_id) return done(null, null);

    const user = await dataSource.getRepository(User).findOne({ where: { u_id } });

    if (!user) {
      console.error("User Not Found in DB");
      return done(new Error("User not found"), null);
    }

    done(null, user);
  } catch (error) {
    console.error("Deserialization Error:", error);
    done(error, null);
  }
});

export default passport;
