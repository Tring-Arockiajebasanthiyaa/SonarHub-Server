import { ObjectType, Field } from "type-graphql";
import { GraphQLJSONObject } from 'graphql-type-json';

@ObjectType()
export class LocReport {
  @Field()
  totalLines!: number;

  @Field()
  sonarQubeLines!: number;

  @Field(() => GraphQLJSONObject)
  languageDistribution!: Record<string, number>;

  @Field()
  lastUpdated!: Date;

  @Field({ nullable: true })
  analysisDuration?: number;

  @Field({ nullable: true })
  analysisStatus?: string;
}