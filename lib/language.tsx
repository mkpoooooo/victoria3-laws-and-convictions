'use client';
import { createContext, useContext } from 'react';
import type { Dataset, Language } from './model';

export const LanguageContext = createContext<Language>('zh-CN');
export const translate = (language: Language, chinese: string, english: string) => language === 'en' ? english : chinese;
export function useText() {
  const language = useContext(LanguageContext);
  return (chinese: string, english: string) => translate(language, chinese, english);
}
export function localizeDataset(data: Dataset, language: Language): Dataset {
  if (language === 'zh-CN') return data;
  return {
    ...data,
    meta: { ...data.meta, targetVersion: '1.14 Open Beta' },
    groups: data.groups.map(group => ({ ...group, name: group.english, laws: group.laws.map(law => ({
      ...law, name: law.english, description: law.descriptionEnglish || '', summary: law.summaryEnglish || '',
    })) })),
    ideologies: data.ideologies.map(item => ({ ...item, name: item.english, description: item.descriptionEnglish || '' })),
    igs: data.igs.map(item => ({ ...item, name: item.english, description: item.descriptionEnglish || '' })),
  };
}
