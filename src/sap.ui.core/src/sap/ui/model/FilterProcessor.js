/*!
 * ${copyright}
 */

sap.ui.define(['./Filter', "sap/base/Log", 'jquery.sap.unicode'],
	function(Filter, Log ) {
	"use strict";

	/**
	 * Helper class for processing of filter objects
	 *
	 * @namespace sap.ui.model.FilterProcessor
	 */
	var FilterProcessor = {};


	/**
	 * Groups filters according to their path and combines filters on the same path using "OR" and filters on
	 * different paths using "AND", all multi-filters contained are ANDed.
	 *
	 * @param {sap.ui.model.Filter[]} aFilters the filters to be grouped
	 * @return {sap.ui.model.Filter} Single Filter containing all filters of the array combined or undefined
	 * @private
	 * @since 1.58
	 */
	FilterProcessor.groupFilters = function(aFilters) {
		var aSorted, sCurPath, aSamePath, aResult = [];

		function getFilter(aFilters, bAnd) {
			if (aFilters.length === 1) {
				return aFilters[0];
			}
			if (aFilters.length > 1) {
				return new Filter(aFilters, bAnd);
			}
			return undefined;
		}

		if (!aFilters) {
			return undefined;
		}
		// No need for grouping if only a single filter is contained
		if (aFilters.length === 1) {
			return aFilters[0];
		}
		// Sort by path
		aSorted = aFilters.slice().sort(function(oFilter1, oFilter2) {
			return (oFilter1.sPath > oFilter2.sPath) - (oFilter1.sPath < oFilter2.sPath);
		});
		// Create multifilters for properties on same path
		aSorted.forEach(function(oFilter) {
			if (oFilter.aFilters || oFilter.sVariable) { // Multifilter/Lambdafilter
				aResult.push(oFilter);
			} else {
				if (oFilter.sPath !== sCurPath) {
					if (aSamePath) {
						aResult.push(getFilter(aSamePath, false)); //OR
					}
					sCurPath = oFilter.sPath;
					aSamePath = [];
				}
				aSamePath.push(oFilter);
			}
		});
		if (aSamePath && aSamePath.length > 0) {
			aResult.push(getFilter(aSamePath, false)); //OR
		}

		return getFilter(aResult, true); //AND
	};

	/**
	 * Combines control filters and application filters using AND and returns the resulting filter
	 *
	 * @param {sap.ui.model.Filter[]} aFilters control filters
	 * @param {sap.ui.model.Filter[]} aApplicationFilters application filters
	 * @return {sap.ui.model.Filter} Single Filter containing all filters of the array combined or undefined
	 * @private
	 * @since 1.58
	 */
	FilterProcessor.combineFilters = function(aFilters, aApplicationFilters) {
		var oGroupedFilter, oGroupedApplicationFilter, oFilter, aCombinedFilters = [];

		oGroupedFilter = this.groupFilters(aFilters);
		oGroupedApplicationFilter = this.groupFilters(aApplicationFilters);

		if (oGroupedFilter) {
			aCombinedFilters.push(oGroupedFilter);
		}
		if (oGroupedApplicationFilter) {
			aCombinedFilters.push(oGroupedApplicationFilter);
		}
		if (aCombinedFilters.length === 1) {
			oFilter = aCombinedFilters[0];
		} else if (aCombinedFilters.length > 1) {
			oFilter = new Filter(aCombinedFilters, true); //AND
		}

		return oFilter;
	};

	/**
	 * Filters the list
	 * Filters must be grouped and combined into a single Filter object in the binding
	 * beforehand, this method just accepts a single filter object, as the root
	 * of the filter tree.
	 *
	 * @param {array} aData the data array to be filtered
	 * @param {sap.ui.model.Filter} oFilter the filter
	 * @param {function} fnGetValue the method to get the actual value to filter on
	 * @return {array} a new array instance containing the filtered data set
	 * @private
	 */
	FilterProcessor.apply = function(aData, oFilter, fnGetValue){
		var aFiltered,
			that = this;

		if (!aData) {
			return [];
		} else if (!oFilter) {
			return aData.slice();
		}

		aFiltered = aData.filter(function(vRef) {
			return that._evaluateFilter(oFilter, vRef, fnGetValue);
		});

		return aFiltered;
	};

	/**
	 * Evaluates the result of a single filter by calling the corresponding
	 * filter function and returning the result.
	 *
	 * @param {sap.ui.model.Filter} oFilter the filter object
	 * @param {object} vRef the reference to the list entry
	 * @param {function} fnGetValue the function to get the value from the list entry
	 * @return {boolean} whether the filter matches or not
	 * @private
	 */
	FilterProcessor._evaluateFilter = function(oFilter, vRef, fnGetValue){
		var oValue, fnTest;
		if (oFilter.aFilters) {
			return this._evaluateMultiFilter(oFilter, vRef, fnGetValue);
		}
		oValue = fnGetValue(vRef, oFilter.sPath);
		fnTest = this.getFilterFunction(oFilter);
		if (!oFilter.fnCompare) {
			oValue = this.normalizeFilterValue(oValue, oFilter.bCaseSensitive);
		}
		if (oValue !== undefined && fnTest(oValue)) {
			return true;
		}
		return false;
	};

	/**
	 * Evaluates the result of a multi filter, by evaluating contained
	 * filters. Depending on the type (AND/OR) not all contained filters need
	 * to be evaluated.
	 *
	 * @param {sap.ui.model.Filter} oMultiFilter the filter object
	 * @param {object} vRef the reference to the list entry
	 * @param {function} fnGetValue the function to get the value from the list entry
	 * @return {boolean} whether the filter matches or not
	 * @private
	 */
	FilterProcessor._evaluateMultiFilter = function(oMultiFilter, vRef, fnGetValue){
		var that = this,
			bAnd = !!oMultiFilter.bAnd,
			aFilters = oMultiFilter.aFilters,
			oFilter,
			bMatch,
			bResult = bAnd;

		for (var i = 0; i < aFilters.length; i++) {
			oFilter = aFilters[i];
			bMatch = that._evaluateFilter(oFilter, vRef, fnGetValue);
			if (bAnd) {
				// if operator is AND, first non matching filter breaks
				if (!bMatch) {
					bResult = false;
					break;
				}
			} else {
				// if operator is OR, first matching filter breaks
				if (bMatch) {
					bResult = true;
					break;
				}
			}
		}
		return bResult;
	};

	/**
	 * Normalize filter value
	 *
	 * @private
	 */
	FilterProcessor.normalizeFilterValue = function(oValue, bCaseSensitive){
		if (typeof oValue == "string") {
			if (bCaseSensitive === undefined) {
				bCaseSensitive = false;
			}
			if (!bCaseSensitive) {
				// Internet Explorer and Edge cannot uppercase properly on composed characters
				if (String.prototype.normalize && (sap.ui.Device.browser.msie || sap.ui.Device.browser.edge)) {
					oValue = oValue.normalize("NFKD");
				}
				oValue = oValue.toUpperCase();
			}

			// use canonical composition as recommended by W3C
			// http://www.w3.org/TR/2012/WD-charmod-norm-20120501/#sec-ChoiceNFC
			if (String.prototype.normalize) {
				oValue = oValue.normalize("NFC");
			}
			return oValue;
		}
		if (oValue instanceof Date) {
			return oValue.getTime();
		}
		return oValue;
	};

	/**
	 * Provides a JS filter function for the given filter
	 */
	FilterProcessor.getFilterFunction = function(oFilter){
		if (oFilter.fnTest) {
			return oFilter.fnTest;
		}
		var oValue1 = oFilter.oValue1,
			oValue2 = oFilter.oValue2,
			fnCompare = oFilter.fnCompare || Filter.defaultComparator;

		if (!oFilter.fnCompare) {
			oValue1 = this.normalizeFilterValue(oValue1, oFilter.bCaseSensitive);
			oValue2 = this.normalizeFilterValue(oValue2, oFilter.bCaseSensitive);
		}

		switch (oFilter.sOperator) {
			case "EQ":
				oFilter.fnTest = function(value) { return fnCompare(value, oValue1) === 0; }; break;
			case "NE":
				oFilter.fnTest = function(value) { return fnCompare(value, oValue1) !== 0; }; break;
			case "LT":
				oFilter.fnTest = function(value) { return fnCompare(value, oValue1) < 0; }; break;
			case "LE":
				oFilter.fnTest = function(value) { return fnCompare(value, oValue1) <= 0; }; break;
			case "GT":
				oFilter.fnTest = function(value) { return fnCompare(value, oValue1) > 0; }; break;
			case "GE":
				oFilter.fnTest = function(value) { return fnCompare(value, oValue1) >= 0; }; break;
			case "BT":
				oFilter.fnTest = function(value) { return (fnCompare(value, oValue1) >= 0) && (fnCompare(value, oValue2) <= 0); }; break;
			case "Contains":
				oFilter.fnTest = function(value) {
					if (value == null) {
						return false;
					}
					if (typeof value != "string") {
						throw new Error("Only \"String\" values are supported for the FilterOperator: \"Contains\".");
					}
					return value.indexOf(oValue1) != -1;
				};
				break;
			case "StartsWith":
				oFilter.fnTest = function(value) {
					if (value == null) {
						return false;
					}
					if (typeof value != "string") {
						throw new Error("Only \"String\" values are supported for the FilterOperator: \"StartsWith\".");
					}
					return value.indexOf(oValue1) == 0;
				};
				break;
			case "EndsWith":
				oFilter.fnTest = function(value) {
					if (value == null) {
						return false;
					}
					if (typeof value != "string") {
						throw new Error("Only \"String\" values are supported for the FilterOperator: \"EndsWith\".");
					}
					var iPos = value.lastIndexOf(oValue1);
					if (iPos == -1) {
						return false;
					}
					return iPos == value.length - new String(oFilter.oValue1).length;
				};
				break;
			default:
				Log.error("The filter operator \"" + oFilter.sOperator + "\" is unknown, filter will be ignored.");
				oFilter.fnTest = function(value) { return true; };
		}
		return oFilter.fnTest;
	};

	return FilterProcessor;

});