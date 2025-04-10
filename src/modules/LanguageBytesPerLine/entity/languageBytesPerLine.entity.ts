import { ObjectType } from "type-graphql";
import { Entity, PrimaryColumn, Column } from "typeorm";
@ObjectType()
@Entity()
export class LanguageBytesPerLineEntity {
  @PrimaryColumn()
  language!: string;

  @Column("int")
  avgBytesPerLine!: number;
}
