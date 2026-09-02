import React from 'react';
import {
  IconFolder as IconFolderTabler,
  IconFileText,
  IconLock,
  IconRocket
} from '@tabler/icons';
import StyledWrapper from './StyledWrapper';

const highlights = [
  {
    icon: IconFolderTabler,
    title: 'Filesystem only',
    desc: 'Collections are plain files on your disk. No cloud sync, no proprietary lock-in.'
  },
  {
    icon: IconFileText,
    title: 'Plain-text collections',
    desc: 'Every request is a readable file you can diff, review, and export at any time.'
  },
  {
    icon: IconLock,
    title: 'Self-hosted',
    desc: 'Your workspace runs on infrastructure you control — API keys and secrets never leave it.'
  },
  {
    icon: IconRocket,
    title: 'Fast and lightweight',
    desc: 'Built to be snappy. No bloated runtimes, just a fast, focused tool for exploring and testing APIs.'
  }
];

const WelcomeStep = () => (
  <StyledWrapper className="step-body">
    <div className="highlights">
      {highlights.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.title} className="highlight-item">
            <div className="highlight-icon">
              <Icon size={18} stroke={1.5} />
            </div>
            <div>
              <div className="highlight-title">{item.title}</div>
              <div className="highlight-desc">{item.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  </StyledWrapper>
);

export default WelcomeStep;
