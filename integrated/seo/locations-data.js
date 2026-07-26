/* ============================================================
   LOCATION LANDING PAGE DATA
   One real, distinguishing industrial profile per city — used to
   generate genuinely different content on each /crane-manufacturer-in-*
   page, not a template with the city name swapped in.
   ============================================================ */
'use strict';

const LOCATIONS = [
  {
    slug: 'bangalore',
    city: 'Bangalore',
    state: 'Karnataka',
    region: 'South India',
    industries: ['aerospace & precision engineering', 'electronics & electrical manufacturing', 'automotive ancillary units', 'machine tools'],
    context: 'Bangalore\u2019s industrial belt around Peenya, Bommasandra, Jigani and Hoskote runs a dense mix of precision-engineering, aerospace-ancillary and electronics manufacturing units alongside heavier automotive and machine-tool shops.',
    craneUse: 'Most Bangalore units run compact single girder EOT cranes and wire rope hoists in low-headroom sheds, with double girder cranes reserved for the heavier machine-tool and fabrication units around Peenya and Bommasandra.',
  },
  {
    slug: 'chennai',
    city: 'Chennai',
    state: 'Tamil Nadu',
    region: 'South India',
    industries: ['automobile & auto-component manufacturing', 'port & heavy engineering', 'leather processing', 'electronics hardware'],
    context: 'Chennai anchors India\u2019s southern automobile corridor — Sriperumbudur, Oragadam and Ambattur — alongside port-linked heavy engineering around Ennore and Manali.',
    craneUse: 'Auto-component and press-shop lines around Sriperumbudur typically specify double girder EOT cranes for die and tool handling, while port-adjacent fabrication yards lean on gantry cranes for outdoor material movement.',
  },
  {
    slug: 'hyderabad',
    city: 'Hyderabad',
    state: 'Telangana',
    region: 'South India',
    industries: ['pharmaceuticals & bulk drugs', 'electronics & defence manufacturing', 'engineering & capital goods'],
    context: 'Hyderabad\u2019s Pashamylaram, Patancheru and Bollaram industrial clusters combine bulk-drug and pharma manufacturing with electronics, defence-ancillary and general engineering units.',
    craneUse: 'Pharma and cleanroom-adjacent plants around Patancheru favour lighter capacity EOT cranes and electric chain hoists for controlled, low-vibration handling, while heavier fabrication units use double girder cranes.',
  },
  {
    slug: 'coimbatore',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    region: 'South India',
    industries: ['textile machinery & spinning mills', 'pump & motor manufacturing', 'foundries & castings'],
    context: 'Coimbatore is one of India\u2019s largest hubs for textile machinery, pumps, motors and precision castings, with a dense concentration of foundries and machine shops across Peelamedu and Kurichi.',
    craneUse: 'Foundries and casting units around Coimbatore typically run heavy-duty double girder EOT cranes rated for continuous three-shift duty, while pump and motor assembly lines use lighter single girder cranes and wire rope hoists.',
  },
  {
    slug: 'hosur',
    city: 'Hosur',
    state: 'Tamil Nadu',
    region: 'South India',
    industries: ['automotive & two-wheeler manufacturing', 'electronics SEZ units', 'precision tooling'],
    context: 'Hosur\u2019s industrial estates and SEZs, just across the Karnataka border, host two-wheeler and auto-component majors alongside a growing base of electronics assembly units.',
    craneUse: 'Auto and two-wheeler assembly-line support units around Hosur commonly run single and double girder EOT cranes for press-line and die-changing operations, sized to fit tight shed headroom.',
  },
  {
    slug: 'visakhapatnam',
    city: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    region: 'South India',
    industries: ['steel & metallurgy', 'shipbuilding & port operations', 'petrochemicals & heavy engineering'],
    context: 'Visakhapatnam (Vizag) combines a major port with steel, shipbuilding and petrochemical industry, making it one of the heaviest-duty crane markets on the east coast.',
    craneUse: 'Steel and heavy-engineering plants around Vizag typically need double girder EOT cranes and circular cranes above 20 Ton, engineered for continuous duty and outdoor/port-adjacent conditions.',
  },
  {
    slug: 'vijayawada',
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    region: 'South India',
    industries: ['agro-processing', 'cement & construction materials', 'general engineering'],
    context: 'Vijayawada serves as a logistics and processing hub for Andhra Pradesh\u2019s agro-processing, cement and construction-materials industries, with industrial growth concentrated around Autonagar and Kondapalli.',
    craneUse: 'Agro-processing and cement-linked units around Vijayawada generally use single and double girder EOT cranes for material handling, with gantry cranes for open yard stockyards.',
  },
  {
    slug: 'mysore',
    city: 'Mysore',
    state: 'Karnataka',
    region: 'South India',
    industries: ['precision engineering', 'electronics & auto-ancillary', 'food processing'],
    context: 'Mysore\u2019s industrial areas — Belagola, Hebbal and Metagalli — host precision engineering, electronics and auto-ancillary units supplying the wider Bangalore–Mysore corridor.',
    craneUse: 'Precision-engineering units around Mysore typically specify single girder EOT cranes and electric chain hoists sized for light-to-medium duty, low-headroom sheds.',
  },
  {
    slug: 'kochi',
    city: 'Kochi',
    state: 'Kerala',
    region: 'South India',
    industries: ['shipbuilding & port operations', 'petrochemicals', 'spice & marine processing'],
    context: 'Kochi\u2019s port, shipyard and petrochemical complex around Willingdon Island and Ambalamugal make it Kerala\u2019s primary heavy-industry and material-handling market.',
    craneUse: 'Shipyard and petrochemical facilities around Kochi typically require heavy double girder EOT and gantry cranes engineered for corrosive coastal conditions and continuous duty.',
  },
  {
    slug: 'tiruppur',
    city: 'Tiruppur',
    state: 'Tamil Nadu',
    region: 'South India',
    industries: ['textile & knitwear manufacturing', 'dyeing & processing units', 'packaging'],
    context: 'Tiruppur is India\u2019s largest knitwear-export cluster, with thousands of dyeing, processing and packaging units supporting the garment supply chain.',
    craneUse: 'Dyeing and processing units around Tiruppur mostly use lighter single girder EOT cranes and electric chain hoists for handling fabric rolls, dye drums and processing machinery.',
  },
  {
    slug: 'salem',
    city: 'Salem',
    state: 'Tamil Nadu',
    region: 'South India',
    industries: ['steel & stainless steel processing', 'textile spinning', 'auto components'],
    context: 'Salem is a major steel and stainless-steel processing centre in Tamil Nadu, alongside a strong base of textile spinning mills and auto-component units.',
    craneUse: 'Steel and stainless-steel processing units around Salem typically run heavy-duty double girder EOT cranes rated for continuous, high-temperature-adjacent duty.',
  },
  {
    slug: 'hubli',
    city: 'Hubli',
    state: 'Karnataka',
    region: 'South India',
    industries: ['railway engineering', 'cotton & agro processing', 'general engineering'],
    context: 'Hubli-Dharwad\u2019s industrial base spans railway workshops, agro-processing and general engineering, serving North Karnataka\u2019s wider manufacturing belt.',
    craneUse: 'Engineering and agro-processing units around Hubli commonly use single girder EOT cranes and gantry cranes for workshop and yard material handling.',
  },
  {
    slug: 'belgaum',
    city: 'Belgaum',
    state: 'Karnataka',
    region: 'South India',
    industries: ['foundries & castings', 'engineering & machine tools', 'sugar processing'],
    context: 'Belagavi (Belgaum) is home to a dense cluster of foundries, casting units and machine-tool manufacturers, alongside sugar and agro-processing industry.',
    craneUse: 'Foundry and casting units around Belgaum typically need heavy-duty double girder EOT cranes for ladle handling and continuous-duty molten-metal operations.',
  },
];

module.exports = { LOCATIONS };
