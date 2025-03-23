import { Arg, Query, Mutation, Resolver, Ctx } from "type-graphql";
import { User } from "../entity/user.entity";
import dataSource from "../../../database/data-source";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { sendEmail } from "../../../utils/emailService";
import { MyContext } from "../../../types/MyContext";
import { AuthResponse} from "../../../graphql/AuthResponse";
import passport from "passport";
@Resolver()
export class AuthResolver {
  private JWT_SECRET = process.env.JWT_SECRET!;

  // ✅ Check Authentication Query
  @Query(() => AuthResponse, { nullable: true })
  async checkAuth(
    @Ctx() ctx: MyContext, 
    @Arg("onlyStatus", { nullable: true }) onlyStatus?: boolean
  ): Promise<AuthResponse | null> {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();  // Ensure database is initialized
    }
  
    if (!ctx.req.user) {
      return { isAuthenticated: false, user: null, token: null };
    }
  
    const userContext = ctx.req.user as { u_id: string; email: string; username: string };
    const userRepo = dataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { email: userContext.email } });
  
    if (!user) {
      return { isAuthenticated: false, user: null, token: null };
    }
  
    return { isAuthenticated: true, user };
  }
  
  
  // ✅ GitHub Authentication Mutation
  @Mutation(() => AuthResponse, { nullable: true })
  async githubAuth(@Ctx() ctx: MyContext): Promise<AuthResponse | null> {
    return new Promise((resolve, reject) => {
      passport.authenticate("github", async (err: any, user: User) => {
        if (err || !user) {
          return reject(new Error("GitHub Authentication Failed"));
        }
  
        const token = jwt.sign({ u_id: user.u_id }, process.env.JWT_SECRET!, {
          expiresIn: "1d",
        });
  
        ctx.req.login(user, (error) => {
          if (error) return reject(new Error("Login failed"));
          resolve({ isAuthenticated: true, user, token });
        });
      })(ctx.req, ctx.res);
    });
  }

  // Forgot Password Mutation
  @Mutation(() => String)
  async forgotPassword(@Arg("email") email: string): Promise<string> {
    try {
      if (!dataSource.isInitialized) await dataSource.initialize();

      const user = await dataSource.getRepository(User).findOne({ where: { email } });
      if (!user) throw new Error("User not found");

      const token = jwt.sign({ u_id: user.u_id }, this.JWT_SECRET, { expiresIn: "15m" });

      await sendEmail(
        user.email,
        "Password Reset",
        `Click here to reset your password: http://localhost:5173/reset-password?token=${token}`
      );

      return "Reset link sent to your email.";
    } catch (error) {
      throw new Error("Something went wrong. Please try again later.");
    }
  }
  @Mutation(() => String)
  async resetPassword(
    @Arg("token") token: string,
    @Arg("newPassword") newPassword: string
  ): Promise<string> {
    try {
      if (!dataSource.isInitialized) await dataSource.initialize();
  
      const payload = jwt.verify(token, this.JWT_SECRET) as { u_id: string };
      const user = await dataSource.getRepository(User).findOne({ where: { u_id: payload.u_id } });
  
      if (!user) throw new Error("User not found");
  
      user.password = await bcrypt.hash(newPassword, 10);
      await dataSource.getRepository(User).save(user);
  
      // ✅ Send confirmation email after password reset
      await sendEmail(
        user.email,
        "Password Changed",
        `Hello ${user.name},\n\nYour password has been successfully updated.\n\nIf this wasn't you, please contact support immediately.`
      );
  
      return "Password reset successfully.";
    } catch (error) {
      console.error("❌ Error resetting password:", error);
      throw new Error("Invalid or expired token.");
    }
  }
  

  // Sign In Mutation
  @Mutation(() => String)
  async signIn(@Arg("email") email: string, @Arg("password") password: string): Promise<string> {
    try {
      if (!dataSource.isInitialized) await dataSource.initialize();
  
      const user = await dataSource.getRepository(User).findOne({ where: { email } });
      if (!user || !user.password) throw new Error("Invalid credentials");
  
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) throw new Error("Invalid credentials");
  
      return jwt.sign({ u_id: user.u_id }, process.env.JWT_SECRET!, { expiresIn: "1d" });
  
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(error.message || "Authentication failed");
      }
      throw new Error("Authentication failed");
    }
  }
  
  // Set Password Mutation
  @Mutation(() => String)
  async setPassword(@Arg("email") email: string, @Arg("password") password: string): Promise<string> {
    try {
      if (!dataSource.isInitialized) await dataSource.initialize();
  
      const user = await dataSource.getRepository(User).findOne({ where: { email } });
      if (!user) throw new Error("User not found");
  
      user.password = await bcrypt.hash(password, 10);
      await dataSource.getRepository(User).save(user);
  
      return "Password updated successfully.";
    } catch (error: unknown) {
      console.error("❌ Error updating password:", error);
    
      if (error instanceof Error) {
        throw new Error(`Failed to update password. Reason: ${error.message}`);
      } else {
        throw new Error("Failed to update password due to an unknown error.");
      }
    }
  }
  
  @Mutation(() => String)
  async sendPasswordChangeEmail(@Arg("email") email: string): Promise<string> {
    try {
      if (!dataSource.isInitialized) await dataSource.initialize();
  
      const user = await dataSource.getRepository(User).findOne({ where: { email } });
      if (!user) throw new Error("User not found");
  
      await sendEmail(user.email, "Reset your password", "Click here to reset your password");
  
      return "Password reset email sent successfully.";
    } catch (error) {
      throw new Error("Failed to send password reset email.");
    }
  }
  
}
