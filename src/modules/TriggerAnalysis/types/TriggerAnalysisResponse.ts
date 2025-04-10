
import { ObjectType, Field } from "type-graphql";

@ObjectType()
export class TriggerAnalysisResponse {
  @Field()
  success!: boolean;

  @Field()
  message!: string;
}
