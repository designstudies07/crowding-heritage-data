window.STUDY2_CONFIG = {
  version: "1.5.0-production",
  productionReady: true,
  localDemoEnabled: false,
  assignmentEndpoint: "/.netlify/functions/assign",
  trialEndpoint: "/.netlify/functions/trial",
  completionEndpoint: "/.netlify/functions/complete",
  minimumDesktopWidth: 1024,
  allowedBrowsers: ["Chrome", "Edge"],
  storageKey: "study2InteractiveDensitySessionProductionV2",
  densities: [
    { id: "empty", label: "Empty", tr: "Tamamen boş" },
    { id: "low", label: "Low", tr: "Düşük" },
    { id: "moderate", label: "Moderate", tr: "Orta" },
    { id: "high", label: "High", tr: "Çok kalabalık" }
  ],
  landmarks: {
    notre_dame: {
      title: "Notre-Dame Cathedral, Paris",
      short: "Notre-Dame",
      targetLabel: "cephe merkezindeki büyük gül pencereyi",
      targetAoi: { xMin: 0.425, xMax: 0.585, yMin: 0.245, yMax: 0.455 },
      images: {
        empty: "stimuli/notre_dame_empty.jpg",
        low: "stimuli/notre_dame_low.jpg",
        moderate: "stimuli/notre_dame_moderate.jpg",
        high: "stimuli/notre_dame_high.jpg"
      }
    },
    duomo: {
      title: "Duomo di Milano, Milano",
      short: "Duomo",
      targetLabel: "cephenin merkezindeki ana giriş portalını",
      targetAoi: { xMin: 0.445, xMax: 0.565, yMin: 0.535, yMax: 0.905 },
      images: {
        empty: "stimuli/duomo_empty.jpg",
        low: "stimuli/duomo_low.jpg",
        moderate: "stimuli/duomo_moderate.jpg",
        high: "stimuli/duomo_high.jpg"
      }
    },
    colosseum: {
      title: "Colosseum, Rome",
      short: "Colosseum",
      targetLabel: "ikinci kemer sırasında görüntünün merkezine en yakın kemerli açıklığı",
      targetAoi: { xMin: 0.445, xMax: 0.545, yMin: 0.365, yMax: 0.565 },
      images: {
        empty: "stimuli/colosseum_empty.jpg",
        low: "stimuli/colosseum_low.jpg",
        moderate: "stimuli/colosseum_moderate.jpg",
        high: "stimuli/colosseum_high.jpg"
      }
    },
    cologne: {
      title: "Cologne Cathedral, Cologne",
      short: "Cologne",
      targetLabel: "cephe merkezindeki ana giriş portalını",
      targetAoi: { xMin: 0.445, xMax: 0.565, yMin: 0.55, yMax: 0.925 },
      images: {
        empty: "stimuli/cologne_empty.jpg",
        low: "stimuli/cologne_low.jpg",
        moderate: "stimuli/cologne_moderate.jpg",
        high: "stimuli/cologne_high.jpg"
      }
    }
  },
  practice: {
    title: "Brandenburg Kapısı, Berlin",
    targetLabel: "kapının merkezindeki ana geçidi",
    targetAoi: { xMin: 0.45, xMax: 0.56, yMin: 0.37, yMax: 0.58 },
    images: {
      empty: "stimuli/practice_empty.jpg",
      low: "stimuli/practice_low.jpg",
      moderate: "stimuli/practice_moderate.jpg",
      high: "stimuli/practice_high.jpg"
    }
  },
  schedules: {
    A1: [["notre_dame","feature"],["duomo","visit"],["colosseum","feature"],["cologne","visit"]],
    A2: [["duomo","visit"],["colosseum","feature"],["cologne","visit"],["notre_dame","feature"]],
    A3: [["colosseum","feature"],["cologne","visit"],["notre_dame","feature"],["duomo","visit"]],
    A4: [["cologne","visit"],["notre_dame","feature"],["duomo","visit"],["colosseum","feature"]],
    B1: [["notre_dame","visit"],["duomo","feature"],["colosseum","visit"],["cologne","feature"]],
    B2: [["duomo","feature"],["colosseum","visit"],["cologne","feature"],["notre_dame","visit"]],
    B3: [["colosseum","visit"],["cologne","feature"],["notre_dame","visit"],["duomo","feature"]],
    B4: [["cologne","feature"],["notre_dame","visit"],["duomo","feature"],["colosseum","visit"]],
    C1: [["notre_dame","feature"],["colosseum","visit"],["duomo","feature"],["cologne","visit"]],
    C2: [["colosseum","visit"],["duomo","feature"],["cologne","visit"],["notre_dame","feature"]],
    C3: [["duomo","feature"],["cologne","visit"],["notre_dame","feature"],["colosseum","visit"]],
    C4: [["cologne","visit"],["notre_dame","feature"],["colosseum","visit"],["duomo","feature"]],
    D1: [["notre_dame","visit"],["colosseum","feature"],["duomo","visit"],["cologne","feature"]],
    D2: [["colosseum","feature"],["duomo","visit"],["cologne","feature"],["notre_dame","visit"]],
    D3: [["duomo","visit"],["cologne","feature"],["notre_dame","visit"],["colosseum","feature"]],
    D4: [["cologne","feature"],["notre_dame","visit"],["colosseum","feature"],["duomo","visit"]]
  }
};
