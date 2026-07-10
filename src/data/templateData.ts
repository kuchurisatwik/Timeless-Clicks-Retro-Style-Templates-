import React from 'react';
import { Grid, Gift, Heart, BookOpen, Newspaper, Quote, GraduationCap, Zap } from 'lucide-react';

export const templateCategories = [
  {
    name: 'All Templates',
    templates: Array.from({ length: 63 }, (_, i) => `template_${String(i + 1).padStart(2, '0')}`).filter(id => id !== 'template_30' && id !== 'template_31')
  },
  {
    name: 'Birthday',
    templates: ['template_09', 'template_11', 'template_13', 'template_14', 'template_15', 'template_32']
  },
  {
    name: 'Wedding & Romance',
    templates: ['template_28', 'template_38', 'template_40']
  },
  {
    name: 'Magazine & Fashion',
    templates: ['template_12', 'template_19', 'template_20', 'template_21', 'template_22', 'template_24', 'template_25', 'template_27', 'template_39', 'template_43', 'template_44']
  },
  {
    name: 'Newspaper & Editorial',
    templates: ['template_01', 'template_02', 'template_03', 'template_04', 'template_05', 'template_06', 'template_07', 'template_08', 'template_10', 'template_16', 'template_17', 'template_18', 'template_23', 'template_26', 'template_29', 'template_33', 'template_34', 'template_35', 'template_36', 'template_37', 'template_41', 'template_42', 'template_47', 'template_60', 'template_61', 'template_62', 'template_63']
  },
  {
    name: 'Quotes & Motivation',
    templates: ['template_45', 'template_46']
  },
  {
    name: 'Graduation',
    templates: ['template_48', 'template_49']
  },
  {
    name: 'Comics & Superheroes',
    templates: ['template_50', 'template_51', 'template_52', 'template_53', 'template_54', 'template_55', 'template_56', 'template_57', 'template_58', 'template_59']
  }
];

export const AI_OPTIMIZED = new Set(['template_01', 'template_12', 'template_28', 'template_38', 'template_50', 'template_60', 'template_61']);

export const getCategoryIcon = (name: string): React.ReactElement => {
  switch (name) {
    case 'All Templates': return React.createElement(Grid, { size: 16 });
    case 'Birthday': return React.createElement(Gift, { size: 16 });
    case 'Wedding & Romance': return React.createElement(Heart, { size: 16 });
    case 'Magazine & Fashion': return React.createElement(BookOpen, { size: 16 });
    case 'Newspaper & Editorial': return React.createElement(Newspaper, { size: 16 });
    case 'Quotes & Motivation': return React.createElement(Quote, { size: 16 });
    case 'Graduation': return React.createElement(GraduationCap, { size: 16 });
    case 'Comics & Superheroes': return React.createElement(Zap, { size: 16 });
    case 'Liked': return React.createElement(Heart, { size: 16, fill: 'currentColor' });
    default: return React.createElement(Grid, { size: 16 });
  }
};
