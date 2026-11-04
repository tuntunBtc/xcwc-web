// UI options only. Public merchandise and prices come from xcwc-api JSON configuration.
const shopConfig=Object.freeze({pageSize:20,carouselIntervalMs:5000});
// Presentation coordinates only. The displayed retail price always comes from the API.
const shopDetailPriceRegions=Object.freeze({
  "hangzhou-xihu": {
    "price": {
      "left": 0.065534,
      "top": 0.611111,
      "width": 0.179612,
      "height": 0.053618,
      "background": "linear-gradient(#feeed6,#ffeed9)",
      "color": "#bb6a48",
      "fontSizeCqw": 10.5014,
      "paddingLeftCqw": 0.9709,
      "paddingTopCqw": 0.6068
    }
  },
  "hangzhou-guihua": {
    "price": {
      "left": 0.076456,
      "top": 0.606589,
      "width": 0.173544,
      "height": 0.04845,
      "background": "linear-gradient(#fde8cd,#fde8ce)",
      "color": "#d16741",
      "fontSizeCqw": 9.4282,
      "paddingLeftCqw": 0.9709,
      "paddingTopCqw": 0.6068
    }
  },
  "suzhou-fengyin": {
    "price": {
      "left": 0.070388,
      "top": 0.615385,
      "width": 0.175971,
      "height": 0.051923,
      "background": "linear-gradient(#fdecd4,#fdead1)",
      "color": "#c86742",
      "fontSizeCqw": 10.2233,
      "paddingLeftCqw": 0.9709,
      "paddingTopCqw": 0.6068
    }
  },
  "luoyang-qingyu": {
    "price": {
      "left": 0.074029,
      "top": 0.608527,
      "width": 0.17233,
      "height": 0.049742,
      "background": "linear-gradient(#fee8cb,#fde7ca)",
      "color": "#c45d36",
      "fontSizeCqw": 9.7797,
      "paddingLeftCqw": 0.9709,
      "paddingTopCqw": 0.6068
    }
  },
  "hangzhou-hehua": {
    "price": {
      "left": 0.068293,
      "top": 0.612192,
      "width": 0.180488,
      "height": 0.052529,
      "background": "linear-gradient(#feeacf,#feead0)",
      "color": "#c94e28",
      "fontSizeCqw": 10.2364,
      "paddingLeftCqw": 0.9756,
      "paddingTopCqw": 0.6098
    }
  },
  "hangzhou-jiangnan-lingyu": {
    "price": {
      "left": 0.071951,
      "top": 0.612338,
      "width": 0.176829,
      "height": 0.050649,
      "background": "linear-gradient(#fee9cb,#fee9cc)",
      "color": "#bc511c",
      "fontSizeCqw": 9.8163,
      "paddingLeftCqw": 0.9756,
      "paddingTopCqw": 0.6098
    }
  },
  "hangzhou-dingsheng-pengpeng": {
    "price": {
      "left": 0.07109,
      "top": 0.634712,
      "width": 0.18128,
      "height": 0.046992,
      "background": "linear-gradient(#fdecd3,#fdebd2)",
      "color": "#e82e19",
      "fontSizeCqw": 9.1902,
      "paddingLeftCqw": 0.9479,
      "paddingTopCqw": 0.5924
    }
  },
  "taizhou-jianke": {
    "price": {
      "left": 0.072967,
      "top": 0.624369,
      "width": 0.184211,
      "height": 0.048611,
      "background": "linear-gradient(#feedd6,#feedd6)",
      "color": "#c64124",
      "fontSizeCqw": 9.6395,
      "paddingLeftCqw": 0.9569,
      "paddingTopCqw": 0.5981
    }
  },
  "shaoxing-jiaoji": {
    "price": {
      "left": 0.078571,
      "top": 0.626021,
      "width": 0.170238,
      "height": 0.04714,
      "background": "linear-gradient(#fdeccf,#ffecd0)",
      "color": "#e23f0c",
      "fontSizeCqw": 9.1833,
      "paddingLeftCqw": 0.9524,
      "paddingTopCqw": 0.5952
    }
  },
  "hangzhou-taohua": {
    "price": {
      "left": 0.078571,
      "top": 0.619351,
      "width": 0.179762,
      "height": 0.05156,
      "background": "linear-gradient(#fdebd0,#fdecd2)",
      "color": "#db3d2a",
      "fontSizeCqw": 9.9927,
      "paddingLeftCqw": 0.9524,
      "paddingTopCqw": 0.5952
    }
  },
  "hangzhou-taozhi-cuiniao": {
    "price": {
      "left": 0.067734,
      "top": 0.618802,
      "width": 0.178571,
      "height": 0.050225,
      "background": "linear-gradient(#fee9ce,#fee9ce)",
      "color": "#c44417",
      "fontSizeCqw": 9.913,
      "paddingLeftCqw": 0.9852,
      "paddingTopCqw": 0.6158
    }
  },
  "hangzhou-dongpo": {
    "price": {
      "left": 0.076456,
      "top": 0.609819,
      "width": 0.169903,
      "height": 0.050388,
      "background": "linear-gradient(#fee7ca,#fde7ca)",
      "color": "#c55531",
      "fontSizeCqw": 9.8605,
      "paddingLeftCqw": 0.9709,
      "paddingTopCqw": 0.6068
    }
  },
  "hangzhou-aiqing": {
    "price": {
      "left": 0.065534,
      "top": 0.616279,
      "width": 0.179612,
      "height": 0.053618,
      "background": "linear-gradient(#fce9cf,#fceacf)",
      "color": "#d66f3c",
      "fontSizeCqw": 10.5406,
      "paddingLeftCqw": 0.9709,
      "paddingTopCqw": 0.6068
    }
  },
  "suzhou-zhufeng": {
    "price": {
      "left": 0.070388,
      "top": 0.608527,
      "width": 0.175971,
      "height": 0.049742,
      "background": "linear-gradient(#fee9cc,#ffead0)",
      "color": "#c66038",
      "fontSizeCqw": 9.7797,
      "paddingLeftCqw": 0.9709,
      "paddingTopCqw": 0.6068
    }
  },
  "suzhou-30903": {
    "price": {
      "left": 0.057039,
      "top": 0.611538,
      "width": 0.188107,
      "height": 0.053205,
      "background": "linear-gradient(#fee8c9,#fee8c9)",
      "color": "#d66e40",
      "fontSizeCqw": 10.5014,
      "paddingLeftCqw": 0.9709,
      "paddingTopCqw": 0.6068
    }
  },
  "hangzhou-baitou-gaojie": {
    "price": {
      "left": 0.0775862069,
      "top": 0.6098191214,
      "width": 0.2044334975,
      "height": 0.0529715762,
      "background": "#fde9cd",
      "color": "#c85d28",
      "fontSizeCqw": 10.5,
      "paddingLeftCqw": 0.85,
      "paddingTopCqw": 0.6
    },
    "masks": [
      {
        "left": 0.7068965517,
        "top": 0.6240310078,
        "width": 0.2376847291,
        "height": 0.0394056848,
        "background": "#fde9cd"
      }
    ]
  },
  "hangzhou-jigong": {
    "price": {
      "left": 0.0775862069,
      "top": 0.6098191214,
      "width": 0.2044334975,
      "height": 0.0529715762,
      "background": "#fde5c8",
      "color": "#c85d28",
      "fontSizeCqw": 10.5,
      "paddingLeftCqw": 0.85,
      "paddingTopCqw": 0.6
    },
    "masks": [
      {
        "left": 0.7068965517,
        "top": 0.6240310078,
        "width": 0.2376847291,
        "height": 0.0394056848,
        "background": "#fde5c8"
      }
    ]
  }
});
