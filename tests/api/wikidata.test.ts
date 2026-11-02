import { describe, it, expect } from 'vitest';
import {
  formatConstructionDate,
  formatHeight,
  buildInterestingFacts,
  parseWikidataSparqlResponse,
  mergeBuildingDetailsIntoEntity,
} from '../../src/api/wikidata';

describe('Wikidata Query Service Integration (src/api/wikidata.ts)', () => {
  describe('formatConstructionDate', () => {
    it('formats ISO datetime with year, month and day', () => {
      expect(formatConstructionDate('1887-01-28T00:00:00Z')).toBe('January 28, 1887');
      expect(formatConstructionDate('1889-03-31T00:00:00Z')).toBe('March 31, 1889');
    });

    it('formats year-only ISO dates cleanly without dummy month/day', () => {
      expect(formatConstructionDate('+1163-00-00T00:00:00Z')).toBe('1163');
      expect(formatConstructionDate('1163-01-01T00:00:00Z')).toBe('1163');
      expect(formatConstructionDate('1900')).toBe('1900');
    });

    it('formats BCE (negative) years', () => {
      expect(formatConstructionDate('-0447-00-00T00:00:00Z')).toBe('447 BCE');
      expect(formatConstructionDate('-0027-01-01T00:00:00Z')).toBe('27 BCE');
    });

    it('handles empty or custom strings gracefully', () => {
      expect(formatConstructionDate('')).toBe('');
      expect(formatConstructionDate('12th century')).toBe('12th century');
    });

    it('formats century-precision (precision=7) and decade-precision (precision=8) Wikidata timestamps accurately', () => {
      // In Wikidata, "13th century" is stored as 1201-01-01T00:00:00Z with precision 7
      expect(formatConstructionDate('1201-01-01T00:00:00Z', '7')).toBe('13th century');
      expect(formatConstructionDate('1701-01-01T00:00:00Z', 7)).toBe('18th century');
      expect(formatConstructionDate('1801-01-01T00:00:00Z', 7)).toBe('19th century');
      expect(formatConstructionDate('1780-01-01T00:00:00Z', 8)).toBe('1780s');
    });
  });

  describe('formatHeight', () => {
    it('formats numeric values with meters', () => {
      expect(formatHeight('330')).toBe('330 m');
      expect(formatHeight('90.5')).toBe('90.5 m');
    });

    it('returns empty string if raw is empty', () => {
      expect(formatHeight('')).toBe('');
    });
  });

  describe('buildInterestingFacts', () => {
    it('synthesizes engaging bullet points from Wikidata properties', () => {
      const facts = buildInterestingFacts({
        qid: 'Q243',
        label: 'Eiffel Tower',
        description: 'tower in Paris',
        inceptionDate: 'January 28, 1887',
        openingDate: 'March 31, 1889',
        height: '330 m',
        architects: ['Stéphen Sauvestre'],
        styles: ['Structural Expressionism'],
        namedAfter: ['Gustave Eiffel'],
        heritage: ['monument historique inscrit'],
        instances: ['observation tower', 'architectural landmark'],
        materials: ['puddled iron', 'steel'],
      });

      expect(facts.length).toBeGreaterThanOrEqual(4);
      expect(facts.some(f => f.includes('January 28, 1887') && f.includes('March 31, 1889'))).toBe(true);
      expect(facts.some(f => f.includes('330 m'))).toBe(true);
      expect(facts.some(f => f.includes('Stéphen Sauvestre'))).toBe(true);
      expect(facts.some(f => f.includes('Gustave Eiffel'))).toBe(true);
      expect(facts.some(f => f.includes('puddled iron'))).toBe(true);
      expect(facts.some(f => f.includes('monument historique inscrit'))).toBe(true);
    });

    it('falls back to description if few structured properties exist', () => {
      const facts = buildInterestingFacts({
        qid: 'Q1',
        label: 'Historic Spot',
        description: 'historic square and gathering place in central district',
        architects: [],
        styles: [],
        namedAfter: [],
        heritage: [],
        instances: [],
        materials: [],
      });

      expect(facts.length).toBeGreaterThan(0);
      expect(facts[0]).toContain('Historic square and gathering place');
    });
  });

  describe('parseWikidataSparqlResponse', () => {
    it('aggregates multiple SPARQL rows into a consolidated object with deduplication', () => {
      const mockSparql = {
        results: {
          bindings: [
            {
              item: { value: 'http://www.wikidata.org/entity/Q243' },
              itemLabel: { value: 'Eiffel Tower' },
              itemDescription: { value: 'lattice tower on the Champ de Mars in Paris' },
              inception: { value: '1887-01-28T00:00:00Z' },
              openingDate: { value: '1889-03-31T00:00:00Z' },
              height: { value: '330' },
              architectLabel: { value: 'Stéphen Sauvestre' },
              styleLabel: { value: 'Structural Expressionism' },
              namedAfterLabel: { value: 'Gustave Eiffel' },
              heritageLabel: { value: 'monument historique inscrit' },
              instanceOfLabel: { value: 'observation tower' },
              materialLabel: { value: 'puddled iron' },
              wikipediaArticle: { value: 'https://en.wikipedia.org/wiki/Eiffel_Tower' },
            },
            {
              item: { value: 'http://www.wikidata.org/entity/Q243' },
              itemLabel: { value: 'Eiffel Tower' },
              itemDescription: { value: 'lattice tower on the Champ de Mars in Paris' },
              inception: { value: '1887-01-28T00:00:00Z' },
              openingDate: { value: '1889-03-31T00:00:00Z' },
              height: { value: '330' },
              architectLabel: { value: 'Stéphen Sauvestre' },
              styleLabel: { value: 'Structural Expressionism' },
              namedAfterLabel: { value: 'Gustave Eiffel' },
              heritageLabel: { value: 'Historic Civil Engineering Landmark' },
              instanceOfLabel: { value: 'architectural landmark' },
              materialLabel: { value: 'wrought iron' },
              wikipediaArticle: { value: 'https://en.wikipedia.org/wiki/Eiffel_Tower' },
            },
          ],
        },
      };

      const result = parseWikidataSparqlResponse(mockSparql);
      expect(result).not.toBeNull();
      expect(result?.qid).toBe('Q243');
      expect(result?.label).toBe('Eiffel Tower');
      expect(result?.inceptionDate).toBe('January 28, 1887');
      expect(result?.openingDate).toBe('March 31, 1889');
      expect(result?.height).toBe('330 m');
      expect(result?.architects).toEqual(['Stéphen Sauvestre']);
      expect(result?.namedAfter).toEqual(['Gustave Eiffel']);
      expect(result?.heritage).toContain('monument historique inscrit');
      expect(result?.heritage).toContain('Historic Civil Engineering Landmark');
      expect(result?.materials).toContain('puddled iron');
      expect(result?.materials).toContain('wrought iron');
      expect(result?.wikipediaTitle).toBe('Eiffel Tower');
      expect(result?.interestingFacts.length).toBeGreaterThanOrEqual(4);
    });

    it('returns null for empty bindings', () => {
      expect(parseWikidataSparqlResponse({ results: { bindings: [] } })).toBeNull();
      expect(parseWikidataSparqlResponse(null)).toBeNull();
      expect(parseWikidataSparqlResponse({})).toBeNull();
    });

    it('filters out streets and roads when isBuilding is true', () => {
      const mockStreetOnly = {
        results: {
          bindings: [
            {
              item: { value: 'http://www.wikidata.org/entity/Q20577400' },
              itemLabel: { value: 'Miera Street' },
              itemDescription: { value: 'street in Riga, Latvia' },
              instanceOfLabel: { value: 'street' },
            },
          ],
        },
      };

      // Disqualified when looking for a building
      expect(parseWikidataSparqlResponse(mockStreetOnly, { isBuilding: true })).toBeNull();

      // Accepted when not looking for a building
      const streetResult = parseWikidataSparqlResponse(mockStreetOnly);
      expect(streetResult).not.toBeNull();
      expect(streetResult?.label).toBe('Miera Street');
    });

    it('returns null when all candidates in spatial search are macro or disqualified entities', () => {
      const mockMacroEntities = {
        results: {
          bindings: [
            {
              item: { value: 'http://www.wikidata.org/entity/Q739032' },
              itemLabel: { value: 'Swedish Livonia' },
              itemDescription: { value: 'dominion in the Baltic region' },
              instanceOfLabel: { value: 'dominion of Sweden' },
            },
            {
              item: { value: 'http://www.wikidata.org/entity/Q15471939' },
              itemLabel: { value: 'Archbishopric of Riga' },
              itemDescription: { value: 'medieval archdiocese' },
              instanceOfLabel: { value: 'Prince-Archbishopric' },
            },
          ],
        },
      };

      expect(parseWikidataSparqlResponse(mockMacroEntities)).toBeNull();
    });

    it('prefers physical building over radio station in spatial search when preferPhysicalBuilding is true', () => {
      const mockAround = {
        results: {
          bindings: [
            {
              item: { value: 'http://www.wikidata.org/entity/Q18615317' },
              itemLabel: { value: 'Latvijas Radio 5' },
              itemDescription: { value: 'Latvian national radio station' },
              inception: { value: '2013-01-01T00:00:00Z' },
              instanceOfLabel: { value: 'radio station' },
            },
            {
              item: { value: 'http://www.wikidata.org/entity/Q56052094' },
              itemLabel: { value: 'Doma laukums 8A' },
              itemDescription: { value: 'building in Riga' },
              inception: { value: '1906-01-01T00:00:00Z' },
              heritageLabel: { value: 'National architectural monument of Latvia' },
              instanceOfLabel: { value: 'building' },
              image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Gr%C4%93cinieku%20iela%2028%202015-09-29.JPG' },
            },
          ],
        },
      };

      const building = parseWikidataSparqlResponse(mockAround, {
        isBuilding: true,
        preferPhysicalBuilding: true,
      });
      expect(building).not.toBeNull();
      expect(building?.qid).toBe('Q56052094');
      expect(building?.inceptionDate).toBe('1906');
      expect(building?.imageUrl).toBe(
        'https://commons.wikimedia.org/wiki/Special:FilePath/Gr%C4%93cinieku%20iela%2028%202015-09-29.JPG?width=800',
      );
      expect(building?.interestingFacts).toContain('The building was constructed in 1906.');

      const orgPrimary = {
        qid: 'Q1807092',
        label: 'Latvijas Radio',
        description: 'public radio broadcasting organization in Latvia',
        inceptionDate: 'November 1, 1925',
        architects: [],
        styles: [],
        namedAfter: [],
        heritage: [],
        instances: ['radio station', 'business'],
        materials: [],
        interestingFacts: [],
        wikipediaTitle: 'Latvijas Radio',
      };

      const merged = mergeBuildingDetailsIntoEntity(orgPrimary, building!);
      expect(merged.buildingConstructionDate).toBe('1906');
      expect(merged.inceptionDate).toBe('November 1, 1925');
      expect(merged.interestingFacts[0]).toBe('The building was constructed in 1906.');
    });

    it('replaces bogus 1201 city-foundation year on Grēcinieku iela 28 (Q56052108) with actual construction date 1780 (rebuilt 1896)', () => {
      const mockGrecinieku28 = {
        results: {
          bindings: [
            {
              item: { value: 'http://www.wikidata.org/entity/Q56052108' },
              itemLabel: { value: 'Grēcinieku iela 28' },
              itemDescription: { value: 'Latvian cultural monument No. 6541' },
              distance: { value: '0.024' },
              inception: { value: '1201-01-01T00:00:00Z' },
              inceptionPrecision: { value: '9' },
              heritageLabel: { value: 'National architectural monument of Latvia' },
              instanceOfLabel: { value: 'building' },
              image: {
                value:
                  'http://commons.wikimedia.org/wiki/Special:FilePath/Gr%C4%93cinieku%20iela%2028%202015-09-29.JPG',
              },
            },
          ],
        },
      };

      const res = parseWikidataSparqlResponse(mockGrecinieku28, {
        isBuilding: true,
        preferPhysicalBuilding: true,
      });
      expect(res).not.toBeNull();
      expect(res?.qid).toBe('Q56052108');
      expect(res?.inceptionDate).toBe('1780 (rebuilt 1896)');
      expect(res?.architects).toContain('Karl Johann Felsko');
    });
  });
});
