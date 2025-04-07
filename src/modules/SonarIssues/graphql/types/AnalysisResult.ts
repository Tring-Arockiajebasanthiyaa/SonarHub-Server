import { ObjectType, Field } from "type-graphql";

@ObjectType()
export class AnalysisResult {
  @Field(() => Boolean) 
  success: boolean = false;

  @Field(() => String) 
  message: string = "";
}