import React from 'react';
import styles from './Card.module.css';

interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
}

export function Card({
  children,
  onClick,
  className = '',
  padding = 'md',
  hoverable = false,
}: CardProps) {
  const Component = onClick ? 'button' : 'div';
  
  return (
    <Component
      className={`
        ${styles.card}
        ${styles[`padding-${padding}`]}
        ${hoverable || onClick ? styles.hoverable : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </Component>
  );
}

