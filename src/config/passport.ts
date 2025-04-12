import passport from "passport";
import { Strategy as GitHubStrategy, Profile } from "passport-github2";
import { User } from "../modules/user/entity/user.entity";
import dataSource from "../database/data-source";
import jwt from "jsonwebtoken";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (
  !GITHUB_CLIENT_ID ||
  !GITHUB_CLIENT_SECRET ||
  !GITHUB_CALLBACK_URL ||
  !JWT_SECRET
) {
  throw new Error("GitHub OAuth environment variables are missing.");
}

passport.use(
  new GitHubStrategy(
    {
      clientID: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
      callbackURL: GITHUB_CALLBACK_URL,
      scope: ["user:email", "repo"],
      passReqToCallback: true,
    },
    async (
      req: Express.Request,
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done: (error: any, user?: any) => void,
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
            email:
              profile.emails?.[0]?.value || `${profile.username}@github.com`,
            username,
            githubId: profile.id,
            githubAccessToken: accessToken,
          });

          await dataSource.getRepository(User).save(user);
        } else {
          user.githubAccessToken = accessToken;
          await dataSource.getRepository(User).save(user);
        }

        const token = jwt.sign({ userId: user.u_id }, JWT_SECRET, {
          expiresIn: "1d",
        });

        return done(null, { user, token });
      } catch (error) {
        console.error("GitHub Strategy Error:", error);
        return done(error, null);
      }
    },
  ),
);

passport.serializeUser((data: any, done) => {
  done(null, data?.user?.u_id || null);
});

passport.deserializeUser(async (userId: string, done) => {
  try {
    if (!userId) {
      return done(null, null);
    }

    const user = await dataSource
      .getRepository(User)
      .findOne({ where: { u_id: userId } });

    if (!user) {
      console.error("User Not Found in DB");
      return done(new Error("User not found"), null);
    }

    return done(null, user);
  } catch (error) {
    console.error("Deserialization Error:", error);
    return done(error, null);
  }
});

export default passport;
