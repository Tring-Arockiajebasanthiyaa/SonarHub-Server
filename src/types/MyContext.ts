import { Request, Response } from "express";


export interface MyContext {
  req: Request;
  res: Response;
  user?: {
    u_id: string; 
    email: string;
    username: string;
  };
  token?: string;
}

export default MyContext; 
