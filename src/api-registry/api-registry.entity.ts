import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { FeatureRegistry } from './feature-registry.entity';

@Entity('api_registry')
export class ApiRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  swaggerUrl: string;

  @Column()
  baseUrl: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @OneToMany(() => FeatureRegistry, feature => feature.apiRegistry, { cascade: true, onDelete: 'CASCADE' })
  features: FeatureRegistry[];
}
