import passport from "passport";
import { Strategy as GitHubStrategy, Profile } from "passport-github2";
import { User } from "../modules/user/entity/user.entity"; // Ensure correct import
import dataSource from "../database/data-source";
import jwt from "jsonwebtoken";

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: process.env.GITHUB_CALLBACK_URL!,
      scope: ["user:email"],
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
        console.log("GitHub Profile:", profile); // Log the GitHub profile
        console.log("Access Token:", accessToken); // Log the access token

        let user = await dataSource.getRepository(User).findOne({
          where: { githubId: profile.id },
        });

        if (!user) {
          // Generate a username if not provided by GitHub
          const username = profile.username || `github_${profile.id}`;

          user = dataSource.getRepository(User).create({
            name: profile.displayName || profile.username,
            email: profile.emails?.[0]?.value || `${profile.username}@github.com`,
            username, // Ensure username is provided
            githubId: profile.id,
          });

          await dataSource.getRepository(User).save(user);
        }

        const token = jwt.sign({ u_id: user.u_id }, process.env.JWT_SECRET!, {
          expiresIn: "1d",
        });

        done(null, { user, token });
      } catch (error) {
        console.error("GitHub Strategy Error:", error); // Log any errors
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((data: any, done) => {
  done(null, data?.user?.u_id|| null);
});

// Deserialize user session
passport.deserializeUser(async (u_id: string, done) => {
  try {
    if (!u_id) return done(null, null);

    const user = await dataSource.getRepository(User).findOne({ where: { u_id } }); // Use u_id instead of userId

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