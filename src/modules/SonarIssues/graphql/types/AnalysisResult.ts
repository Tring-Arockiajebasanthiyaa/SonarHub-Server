import { ObjectType, Field } from "type-graphql";

@ObjectType()
export class AnalysisResult {
  @Field(() => Boolean) 
  success = false;

  @Field(() => String) 
  message = "";
}
