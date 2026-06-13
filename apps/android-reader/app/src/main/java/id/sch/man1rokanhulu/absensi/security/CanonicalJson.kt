package id.sch.man1rokanhulu.absensi.security

object CanonicalJson {
    fun stringify(map: Map<String, Any?>): String {
        return map.filterValues { it != null }
            .toSortedMap()
            .entries.joinToString(prefix = "{", postfix = "}", separator = ",") { (key, value) ->
                "${quote(key)}:${valueToJson(value)}"
            }
    }

    private fun valueToJson(value: Any?): String = when (value) {
        null -> "null"
        is Number, is Boolean -> value.toString()
        is Map<*, *> -> stringify(value.entries.associate { it.key.toString() to it.value })
        is Iterable<*> -> value.joinToString(prefix = "[", postfix = "]", separator = ",") { valueToJson(it) }
        else -> quote(value.toString())
    }

    private fun quote(input: String): String = buildString {
        append('"')
        input.forEach { ch ->
            when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> append(ch)
            }
        }
        append('"')
    }
}
