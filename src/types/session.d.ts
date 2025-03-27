
import "express-session";

declare module "express-session" {
  interface SessionData {
    token?: string;  
    u_id?: string;
    userEmail?: string;
  }
}
