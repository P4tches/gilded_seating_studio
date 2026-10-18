/* Visual presets for the seating chart. Pure data — imported by model.js */

export const PRESETS = {
  gilded: {
    id: 'gilded',
    name: 'Gilded Mirror',
    tagline: 'Script & antique gold',
    swatches: ['#cdd2c6', '#fbf7ee', '#c9a35c'],
    theme: {
      background: { type: 'mirror', color: '#dfe3d9', image: null, overlay: 0, bokeh: true },
      frame: { style: 'baroque', color: '#c9a35c' },
      ink: '#fdf8ec',
      accent: '#e7cf9c',
      card: {
        bg: '#fbf7ee', border: '#ffffff', borderWidth: 0, radius: 2, shadow: true,
        labelColor: '#221d18', guestColor: '#3a342c',
        pin: 'seal', pinColor: '#c9a35c', pinSize: 76, tilt: 0
      }
    },
    typography: {
      titleFont: 'great-vibes', titleSize: 200, titleSpacing: 0, titleLineHeight: 0.98, titleItalic: false,
      dateFont: 'montserrat', dateSize: 31, dateSpacing: 0.26, dateWeight: 500,
      labelFont: 'parisienne', labelSize: 68, labelSpacing: 0, labelItalic: false,
      guestFont: 'montserrat', guestSize: 17.5, guestSpacing: 0.12, guestWeight: 500,
      guestLineHeight: 1.62, guestUpper: true
    }
  },

  ivory: {
    id: 'ivory',
    name: 'Ivory Atelier',
    tagline: 'Editorial serif, warm paper',
    swatches: ['#f3ecdf', '#fffdf8', '#a8874d'],
    theme: {
      background: { type: 'paper', color: '#f3ecdf', image: null, overlay: 0, bokeh: false },
      frame: { style: 'line', color: '#ad8b51' },
      ink: '#2e2921',
      accent: '#a8874d',
      card: {
        bg: '#fffdf8', border: '#e8dfce', borderWidth: 1, radius: 3, shadow: true,
        labelColor: '#2e2921', guestColor: '#4a4338',
        pin: 'pin', pinColor: '#a8874d', pinSize: 52, tilt: 0
      }
    },
    typography: {
      titleFont: 'playfair-display', titleSize: 152, titleSpacing: 0, titleLineHeight: 1.04, titleItalic: true,
      dateFont: 'jost', dateSize: 32, dateSpacing: 0.24, dateWeight: 500,
      labelFont: 'cormorant-garamond', labelSize: 72, labelSpacing: 0, labelItalic: true,
      guestFont: 'jost', guestSize: 17, guestSpacing: 0.14, guestWeight: 400,
      guestLineHeight: 1.62, guestUpper: true
    }
  },

  garden: {
    id: 'garden',
    name: 'Sage Garden',
    tagline: 'Botanical green & linen',
    swatches: ['#e6e8dc', '#fbf8ee', '#a88956'],
    theme: {
      background: { type: 'linen', color: '#e6e8dc', image: null, overlay: 0, bokeh: false },
      frame: { style: 'arch', color: '#a88956' },
      ink: '#3b472f',
      accent: '#7f8c63',
      card: {
        bg: '#fbf8ee', border: '#ffffff', borderWidth: 0, radius: 2, shadow: true,
        labelColor: '#35422b', guestColor: '#4e5843',
        pin: 'wax', pinColor: '#7d8a61', pinSize: 60, tilt: 0
      }
    },
    typography: {
      titleFont: 'pinyon-script', titleSize: 204, titleSpacing: 0, titleLineHeight: 1.0, titleItalic: false,
      dateFont: 'jost', dateSize: 30, dateSpacing: 0.26, dateWeight: 500,
      labelFont: 'pinyon-script', labelSize: 66, labelSpacing: 0, labelItalic: false,
      guestFont: 'cormorant-garamond', guestSize: 20, guestSpacing: 0.1, guestWeight: 500,
      guestLineHeight: 1.55, guestUpper: true
    }
  },

  noir: {
    id: 'noir',
    name: 'After Dark',
    tagline: 'Candlelit gold on ink',
    swatches: ['#191a1d', '#f5efe3', '#c8a45f'],
    theme: {
      background: { type: 'paper', color: '#191a1d', image: null, overlay: 0, bokeh: false },
      frame: { style: 'baroque', color: '#c8a45f' },
      ink: '#f6ead2',
      accent: '#dcc18a',
      card: {
        bg: '#f5efe3', border: '#ffffff', borderWidth: 0, radius: 2, shadow: true,
        labelColor: '#221f1a', guestColor: '#3e382e',
        pin: 'seal', pinColor: '#c8a45f', pinSize: 72, tilt: 0
      }
    },
    typography: {
      titleFont: 'great-vibes', titleSize: 202, titleSpacing: 0, titleLineHeight: 0.98, titleItalic: false,
      dateFont: 'jost', dateSize: 32, dateSpacing: 0.28, dateWeight: 500,
      labelFont: 'parisienne', labelSize: 66, labelSpacing: 0, labelItalic: false,
      guestFont: 'jost', guestSize: 18, guestSpacing: 0.12, guestWeight: 500,
      guestLineHeight: 1.6, guestUpper: true
    }
  },

  blush: {
    id: 'blush',
    name: 'Blush Linen',
    tagline: 'Romantic dusk & rose gold',
    swatches: ['#f4e7e1', '#fffaf6', '#bb8d83'],
    theme: {
      background: { type: 'linen', color: '#f4e7e1', image: null, overlay: 0, bokeh: false },
      frame: { style: 'line', color: '#bb8d83' },
      ink: '#684744',
      accent: '#bb8d83',
      card: {
        bg: '#fffaf6', border: '#f0ddd6', borderWidth: 1, radius: 4, shadow: true,
        labelColor: '#5d403e', guestColor: '#72544f',
        pin: 'pin', pinColor: '#bb8d83', pinSize: 52, tilt: 0
      }
    },
    typography: {
      titleFont: 'parisienne', titleSize: 184, titleSpacing: 0, titleLineHeight: 1.0, titleItalic: false,
      dateFont: 'jost', dateSize: 31, dateSpacing: 0.26, dateWeight: 500,
      labelFont: 'cormorant-garamond', labelSize: 68, labelSpacing: 0, labelItalic: true,
      guestFont: 'jost', guestSize: 17.5, guestSpacing: 0.16, guestWeight: 400,
      guestLineHeight: 1.64, guestUpper: true
    }
  }
};

export const PRESET_ORDER = ['gilded', 'ivory', 'garden', 'noir', 'blush'];

export const TEMPLATES = [
  {
    id: 'gilded-demo',
    name: 'Gilded Mirror',
    description: '12 tables · 108 guests · the classic look',
    preset: 'gilded',
    projectName: 'Our Favorite People',
    title: 'Our Favorite People',
    date: 'June 10, 2026',
    demo: true
  },
  {
    id: 'ivory-8',
    name: 'Ivory Atelier',
    description: '8 tables · warm editorial serif',
    preset: 'ivory',
    projectName: 'The People We Love',
    title: 'The People We Love',
    date: 'September 12, 2026',
    tables: 8,
    guestsPerTable: 8
  },
  {
    id: 'garden-10',
    name: 'Sage Garden',
    description: '10 tables · botanical and soft',
    preset: 'garden',
    projectName: 'Gather With Us',
    title: 'Gather With Us',
    date: 'May 23, 2026',
    tables: 10,
    guestsPerTable: 8
  },
  {
    id: 'noir-9',
    name: 'After Dark',
    description: '9 tables · candlelit and dramatic',
    preset: 'noir',
    projectName: 'Our People',
    title: 'Our People',
    date: 'October 3, 2026',
    tables: 9,
    guestsPerTable: 9
  },
  {
    id: 'blush-6',
    name: 'Blush Linen',
    description: '6 tables · soft rose and linen',
    preset: 'blush',
    projectName: 'With Love',
    title: 'With Love',
    date: 'April 18, 2026',
    tables: 6,
    guestsPerTable: 9
  },
  {
    id: 'blank',
    name: 'Start Blank',
    description: '6 empty tables · your names here',
    preset: 'gilded',
    projectName: 'Our Seating Chart',
    title: 'Our Favorite People',
    date: 'June 10, 2026',
    tables: 6,
    guestsPerTable: 0
  }
];
