import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { FeatureRegistry } from './feature-registry.entity';

@Entity('endpoint_registry')
export class EndpointRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  path: string;

  @Column()
  method: string;

  @Column({ nullable: true })
  summary: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  operationId: string;

  @Column({ type: 'jsonb', nullable: true })
  parameters: any;

  @ManyToOne(() => FeatureRegistry, feature => feature.endpoints, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'featureRegistryId' })
  featureRegistry: FeatureRegistry;
}
